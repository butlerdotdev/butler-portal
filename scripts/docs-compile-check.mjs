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
// Annotation contract (all failures below are hard-fail CI):
//
// - `title="foo.ts"` on a `ts`/`tsx` fence: extract as foo.ts, compile it.
// - `title="foo.ts" append`: concatenate onto an existing extracted file
//   (used when the doc splits one file's declarations across two blocks).
// - `noCompile="<reason>"`: explicit opt-out; the reason has to be present
//   so a reviewer sees WHY the block is skipped, not just THAT it is. The
//   escape hatch justifies itself in every fence.
// - `title="...fragment..."` (case-insensitive): illustrative fragment.
//   The `title="package.json fragment"` block is treated specially: its
//   JSON content becomes the harness's dependency set (see below).
//
// Failures on the annotation contract itself:
//
// - Unannotated `ts` / `tsx` fence: FAIL. Silent skipping is the pattern
//   that shipped three doc-produced compile errors in a row; the check
//   cannot check what it cannot see. Scope the failure to the languages
//   the check exists for: yaml, markdown, sh, etc. are surfaced as an
//   info summary but do not block. A ts block that omits its annotation
//   is not a benign fragment; it is an unchecked sample.
// - `noCompile` without a reason (bare `noCompile`, not `noCompile="..."`):
//   FAIL. The opt-out has to name a reason so escape-hatch usage is
//   visible in the diff and to reviewers.
//
// Design notes:
//
// - Deps come FROM the doc's own `title="package.json fragment"` snippet,
//   not a hardcoded list. If the doc's stated deps drift from what
//   compiles, this catches it.
// - Every doc in `DOCS_TO_CHECK` gets its own isolated harness so dep
//   sets can differ per doc. Cross-doc consistency is a known gap —
//   two docs each declaring their own contradicting dep sets will not
//   be flagged.
// - Module resolution is checked to the extent tsc + the harness's dep
//   set covers it. Sibling imports across extracted files ARE checked;
//   imports of packages not in the harness deps fail with `Cannot find
//   module`. Nested-path imports that the doc's prose describes but the
//   fence doesn't produce (e.g. "put this at src/routes/router.ts" while
//   the block is extracted flat) fail with `Cannot find module` too —
//   the doc has to be internally consistent about layout.

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
const OPEN_NOCOMPILE_RE = /^```([a-z]+)\s+noCompile="([^"]+)"\s*$/;
const OPEN_NOCOMPILE_BARE_RE = /^```([a-z]+)\s+noCompile\s*$/;
const OPEN_BARE_RE = /^```([a-z]+)\s*$/;
const CLOSE_RE = /^```\s*$/;

// Languages the compile-check applies to. Unannotated blocks in these
// languages FAIL the build (the check cannot check what it cannot see;
// a TS block that skips extraction is a TS block that ships unchecked).
// Blocks in other languages emit a warning summary but do not fail —
// the harness is not a YAML linter or a markdown validator.
const COMPILE_CHECKED_LANGS = new Set(['ts', 'tsx']);

function extractBlocks(mdText) {
  // Returns { files, depsJson, unannotatedCompileChecked, otherBareBlocks,
  //           noCompileMissingReason }
  //
  // - unannotatedCompileChecked: bare ts/tsx blocks — FAIL the run.
  // - otherBareBlocks: bare yaml/markdown/etc. — WARN only.
  // - noCompileMissingReason: `noCompile` without a `="reason"` — FAIL
  //   the run. The opt-out has to justify itself so a reviewer sees WHY
  //   the block is skipped, not just THAT it is.

  const files = new Map();
  const unannotatedCompileChecked = [];
  const otherBareBlocks = [];
  const noCompileMissingReason = [];
  let depsJson = null;

  const lines = mdText.split('\n');
  let cursor = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (cursor === null) {
      const mTitle = line.match(OPEN_TITLE_RE);
      const mNo = line.match(OPEN_NOCOMPILE_RE);
      const mNoBare = line.match(OPEN_NOCOMPILE_BARE_RE);
      const mBare = line.match(OPEN_BARE_RE);
      if (mTitle) {
        const [, , file, appendFlag] = mTitle;
        if (/fragment/i.test(file)) {
          cursor = { kind: 'fragment', file, buf: [] };
        } else {
          cursor = { kind: 'title', file, buf: [], append: !!appendFlag };
        }
      } else if (mNo) {
        // Explicit opt-out with reason. Skip. Kept in the doc for
        // documentation; ignored by the harness.
        cursor = { kind: 'nocompile', reason: mNo[2], buf: [] };
      } else if (mNoBare) {
        // `noCompile` without a reason. Fail with a specific message
        // pointing at the fence's line number.
        noCompileMissingReason.push({ lang: mNoBare[1], firstLine: i + 1 });
        cursor = { kind: 'nocompile', reason: null, buf: [] };
      } else if (mBare) {
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
        if (COMPILE_CHECKED_LANGS.has(cursor.lang)) {
          unannotatedCompileChecked.push({ lang: cursor.lang, firstLine: cursor.firstLine });
        } else {
          otherBareBlocks.push({ lang: cursor.lang, firstLine: cursor.firstLine });
        }
      }
      cursor = null;
      continue;
    }
    cursor.buf.push(line);
  }

  return {
    files,
    depsJson,
    unannotatedCompileChecked,
    otherBareBlocks,
    noCompileMissingReason,
  };
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
  const {
    files,
    depsJson,
    unannotatedCompileChecked,
    otherBareBlocks,
    noCompileMissingReason,
  } = extractBlocks(md);

  // Fail-first checks against the annotation contract. These have to
  // block the run before extraction/compile because the whole point of
  // the annotation contract is that its escape hatches are visible.
  const contractFailures = [];
  if (unannotatedCompileChecked.length > 0) {
    for (const b of unannotatedCompileChecked) {
      contractFailures.push(
        `${docPath}:${b.firstLine}  ` +
          `unannotated \`${b.lang}\` block. Add \`title="<file>"\` to compile it, ` +
          `or \`noCompile="<reason>"\` to skip with an explicit justification.`,
      );
    }
  }
  if (noCompileMissingReason.length > 0) {
    for (const b of noCompileMissingReason) {
      contractFailures.push(
        `${docPath}:${b.firstLine}  ` +
          `\`noCompile\` without a reason. Use \`noCompile="<why this block is skipped>"\` ` +
          `so a reviewer sees why the block is opted out.`,
      );
    }
  }
  if (contractFailures.length > 0) {
    console.error('annotation contract violations:');
    for (const f of contractFailures) console.error('  ' + f);
    return { ok: false, docPath, otherBareBlocks, reason: 'contract' };
  }

  if (files.size === 0) {
    console.log(
      `no title-annotated blocks; nothing to compile. If this doc has ` +
        `code samples that should compile, add title="foo.ts" info-strings.`,
    );
    return { ok: true, docPath, otherBareBlocks };
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
  // --legacy-peer-deps mirrors examples/adopter-plugin/backend/.npmrc.
  // Yarn (used across butler-portal) resolves peer conflicts more loosely
  // than npm 9+; @backstage/cli@0.36.4's peerOptional jsdom range
  // conflicts with a transitive jest-environment-jsdom's jsdom. Docs do
  // not currently pull @backstage/cli into the harness, so this is
  // future-proofing rather than an active fix — kept aligned so a doc
  // that adds a CLI-adjacent dep does not hit ERESOLVE from a different
  // install semantic than the rest of the repo.
  console.log('npm install ...');
  const install = spawnSync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--legacy-peer-deps', '--silent'],
    { cwd: harness, stdio: 'inherit' },
  );
  if (install.status !== 0) {
    return { ok: false, docPath, reason: 'npm install failed', otherBareBlocks };
  }

  // Compile.
  console.log('tsc --noEmit ...');
  const tsc = spawnSync('npx', ['tsc', '--noEmit'], {
    cwd: harness,
    stdio: 'inherit',
  });

  const ok = tsc.status === 0;
  return { ok, docPath, harness, otherBareBlocks };
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
  if (r.otherBareBlocks && r.otherBareBlocks.length > 0) {
    console.log(
      `  info: ${r.otherBareBlocks.length} unannotated non-compile-checked block(s) ` +
        `(langs: ${[...new Set(r.otherBareBlocks.map(b => b.lang))].join(', ')}). ` +
        `The harness does not lint these languages; annotate with title="..." if ` +
        `you want them written to the harness anyway.`,
    );
  }
}

if (anyFail) {
  console.error('\ndocs-compile-check FAILED');
  process.exit(1);
}
console.log('\ndocs-compile-check PASS');
