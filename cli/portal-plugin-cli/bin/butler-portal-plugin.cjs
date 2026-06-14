#!/usr/bin/env node
/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Butler Portal plugin CLI. A thin, honest wrapper over
 * @red-hat-developer-hub/cli. Every command is forwarded verbatim to
 * the underlying rhdh-cli binary; the wrapper's only added behavior is
 * a one-line banner identifying the wrapper version and the underlying
 * rhdh-cli version it pins, and exit-code propagation.
 *
 * Why this exists at all: the test plugin scaffold, the examples
 * directory, and the adopter docs all reference a Butler-stable
 * command surface ("butler-portal-plugin"). The dependency on rhdh-cli
 * is honest and visible in the wrapper's package.json -- adopters who
 * want to inspect or replace it can. When (if) the runtime contract
 * grows divergent from rhdh-cli, the wrapper becomes the seam where
 * Butler-Portal-specific behavior lands without breaking the
 * adopter-facing command name.
 */

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const wrapperPkg = require('../package.json');

// Resolve the rhdh-cli binary path through Node's module resolver so
// the wrapper finds it whether it is hoisted (npm root install) or
// nested (yarn / pnpm install layout). Resolving via package.json
// rather than guessing a relative path makes this robust to install
// layout changes.
function resolveRhdhCliBin() {
	const pkgJsonPath = require.resolve('@red-hat-developer-hub/cli/package.json');
	const pkgDir = path.dirname(pkgJsonPath);
	const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
	const binEntry =
		typeof pkg.bin === 'string'
			? pkg.bin
			: pkg.bin && pkg.bin['rhdh-cli'];
	if (!binEntry) {
		throw new Error(
			'@red-hat-developer-hub/cli package.json does not declare a `rhdh-cli` bin entry. ' +
				'The wrapper cannot delegate without it. Reinstall the dependency or pin a version ' +
				'compatible with this wrapper.',
		);
	}
	return { binPath: path.join(pkgDir, binEntry), rhdhVersion: pkg.version };
}

function main() {
	let resolved;
	try {
		resolved = resolveRhdhCliBin();
	} catch (err) {
		process.stderr.write(`[butler-portal-plugin] ${err.message}\n`);
		process.exit(1);
	}

	process.stderr.write(
		`[butler-portal-plugin ${wrapperPkg.version}] wrapping @red-hat-developer-hub/cli ${resolved.rhdhVersion}\n`,
	);

	const result = spawnSync(process.execPath, [resolved.binPath, ...process.argv.slice(2)], {
		stdio: 'inherit',
	});

	if (result.error) {
		process.stderr.write(`[butler-portal-plugin] failed to spawn rhdh-cli: ${result.error.message}\n`);
		process.exit(1);
	}

	process.exit(result.status ?? 0);
}

main();
