#!/usr/bin/env node
// docs-compile-check
//
// Extracts fenced code blocks from designated Markdown docs, wraps them in
// a compile harness with dependencies sourced FROM the doc's own dep
// snippet, and runs `tsc --noEmit`. Fails on compile error.
//
// Why: three rounds of manual review shipped three doc-produced compile
// errors, including one where the commit message claimed "compiles clean"
// and did not. Reading a TypeScript sample and compiling it are different
// activities; the difference is invisible until you compile.
//
// Design constraints (see also docs/architecture/permissions.md and
// docs/plugin-authoring/authorization.md):
//
// - Opt-in per block via fence info-string annotation. `title="foo.ts"`
//   means "extract this block as foo.ts and compile it." Blocks without
//   `title=` are ignored. Rationale: many blocks in the docs are
//   illustrative fragments (env.registerInit({...}) stubs, YAML policy
//   snippets, adopter-config chunks); making the CI opt-out per fragment
//   would produce endless false positives.
// - `title="foo.ts" append` concatenates onto an existing extracted file
//   (used when the doc splits one file's declarations across two blocks).
// - `noCompile` marker is documentary — flags a block the author
//   intentionally does not want compiled (e.g. a fragment). Not required
//   for the CI to skip, but useful in review to signal author intent.
// - `title="...fragment..."` (case-insensitive) is treated as an illustrative
//   snippet and skipped, since the JSON dep snippets in the docs sit in
//   fenced blocks marked `title="package.json fragment"`.
// - Deps for the compile harness come FROM the doc's own dep snippet, not
//   a hardcoded list. If the doc's snippet drifts from what actually
//   compiles, the CI catches it.
// - Every doc listed in `DOCS_TO_CHECK` gets its own isolated harness so
//   dep sets can differ per doc.
// - Module resolution is checked to the extent tsc + the harness's dep
//   set covers it. Sibling imports across extracted files ARE checked;
//   imports of packages not in the harness deps fail explicitly with
//   `Cannot find module`. Imports of nested paths that the doc's prose
//   describes but the fence doesn't produce (e.g. "put this at
//   src/routes/router.ts" while the block is extracted flat) will fail
//   with `Cannot find module` here too — the doc has to be consistent.
//   Imports across DOCS are not checked (each doc gets an isolated harness).

import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve, basename } from 'node:path';

// Docs that ship compile-check-worthy code samples. Extend as new doc
// families adopt the `title="..."` convention.
const DOCS_TO_CHECK = [
  'docs/plugin-authoring/authorization.md',
];

// Fence info-string patterns we recognise.
const OPEN_TITLE_RE = /^```([a-z]+)\s+title="([^"]+)"(\s+append)?\s*$/;
const OPEN_NOCOMPILE_RE = /^```([a-z]+)\s+noCompile\s*$/;
const OPEN_BARE_RE = /^```([a-z]+)\s*$/;
const CLOSE_RE = /^```\s*$/;

function extractBlocks(mdText) {
  // Returns { files: Map<string, string>, depsJson: string | null,
  //           bareBlocks: Array<{lang, firstLine}> }
  // depsJson is the raw JSON text from a `title="package.json fragment"`
  // block if the doc supplies one.

  const files = new Map();
  const bareBlocks = [];
  let depsJson = null;

  const lines = mdText.split('\n');
  let cursor = null; // { kind: 'title'|'nocompile'|'bare'|'fragment', ... }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (cursor === null) {
      const mTitle = line.match(OPEN_TITLE_RE);
      const mNo = line.match(OPEN_NOCOMPILE_RE);
      const mBare = line.match(OPEN_BARE_RE);
      if (mTitle) {
        const [, , file, appendFlag] = mTitle;
        if (/fragment/i.test(file)) {
          // Illustrative-fragment title (e.g. "package.json fragment").
          cursor = { kind: 'fragment', file, buf: [] };
        } else {
          cursor = { kind: 'title', file, buf: [], append: !!appendFlag };
        }
      } else if (mNo) {
        cursor = { kind: 'nocompile', buf: [] };
      } else if (mBare) {
        // Track for reporting; do not compile. This is the ambiguous
        // shape the design flags for eventual opt-in-or-out.
        const lang = mBare[1];
        cursor = { kind: 'bare', lang, buf: [], firstLine: i + 1 };
      }
      continue;
    }
    if (CLOSE_RE.test(line)) {
      if (cursor.kind === 'title') {
        const existing = files.get(cursor.file) ?? '';
        const joined = cursor.buf.join('\n') + '\n';
        files.set(cursor.file, cursor.append ? existing + joined : joined);
      } else if (cursor.kind === 'fragment' && cursor.file === 'package.json fragment') {
        depsJson = cursor.buf.join('\n');
      } else if (cursor.kind === 'bare') {
        bareBlocks.push({ lang: cursor.lang, firstLine: cursor.firstLine });
      }
      cursor = null;
      continue;
    }
    cursor.buf.push(line);
  }

  return { files, depsJson, bareBlocks };
}

function buildPackageJson(depsFragmentJson) {
  // The doc supplies a `title="package.json fragment"` block containing
  // a partial JSON object with `"dependencies": { ... }`. Wrap it in a
  // full package.json.
  if (!depsFragmentJson) {
    throw new Error(
      'no `title="package.json fragment"` block found; the harness cannot ' +
        'derive its dependency set from the doc itself. Add one or add the ' +
        'doc to a maintained hardcoded fallback.',
    );
  }
  const wrapped = `{ ${depsFragmentJson} }`;
  const parsed = JSON.parse(wrapped);
  return {
    name: 'docs-compile-harness',
    version: '0.0.0',
    private: true,
    dependencies: {
      ...parsed.dependencies,
      // Express/express-promise-router are consistently referenced by the
      // router.ts samples; the doc's dep snippet omits them because they
      // are already declared in adopters' package.json for other reasons.
      // If a future doc block imports something the doc's fragment does
      // not declare, tsc will fail with Cannot find module and the doc
      // will need updating.
      express: '^4.21.2',
      'express-promise-router': '^4.1.1',
    },
    devDependencies: {
      typescript: '^5.4.0',
      '@types/express': '^4.17.21',
    },
  };
}

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2020',
    module: 'CommonJS',
    esModuleInterop: true,
    strict: true,
    skipLibCheck: true,
    moduleResolution: 'node',
    noEmit: true,
  },
  include: ['src/**/*'],
};

async function checkDoc(docPath) {
  const abs = resolve(process.cwd(), docPath);
  console.log(`\n=== ${docPath} ===`);
  const md = await readFile(abs, 'utf8');
  const { files, depsJson, bareBlocks } = extractBlocks(md);

  if (files.size === 0) {
    console.log(
      `no title-annotated blocks; nothing to compile. If this doc has ` +
        `code samples that should compile, add title="foo.ts" info-strings.`,
    );
    return { ok: true, docPath };
  }

  const harness = await mkdtemp(resolve(tmpdir(), 'docs-compile-'));
  console.log(`harness: ${harness}`);
  await mkdir(resolve(harness, 'src'), { recursive: true });

  // Write extracted files.
  for (const [file, content] of files) {
    const out = resolve(harness, 'src', file);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, content, 'utf8');
  }

  // package.json + tsconfig.
  const pkg = buildPackageJson(depsJson);
  await writeFile(resolve(harness, 'package.json'), JSON.stringify(pkg, null, 2));
  await writeFile(resolve(harness, 'tsconfig.json'), JSON.stringify(TSCONFIG, null, 2));

  // Install.
  console.log('npm install ...');
  const install = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], {
    cwd: harness,
    stdio: 'inherit',
  });
  if (install.status !== 0) {
    return { ok: false, docPath, reason: 'npm install failed', bareBlocks };
  }

  // Compile.
  console.log('tsc --noEmit ...');
  const tsc = spawnSync('npx', ['tsc', '--noEmit'], {
    cwd: harness,
    stdio: 'inherit',
  });

  const ok = tsc.status === 0;
  return { ok, docPath, harness, bareBlocks };
}

let anyFail = false;
const results = [];
for (const docPath of DOCS_TO_CHECK) {
  const result = await checkDoc(docPath);
  results.push(result);
  if (!result.ok) anyFail = true;
}

console.log('\n=== summary ===');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.docPath}`);
  if (r.bareBlocks && r.bareBlocks.length > 0) {
    console.log(
      `  warn: ${r.bareBlocks.length} unannotated fenced block(s) (langs: ` +
        `${[...new Set(r.bareBlocks.map(b => b.lang))].join(', ')}); ` +
        `add title="foo.ts" or noCompile to signal intent.`,
    );
  }
}

if (anyFail) {
  console.error('\ndocs-compile-check FAILED');
  process.exit(1);
}
console.log('\ndocs-compile-check PASS');
