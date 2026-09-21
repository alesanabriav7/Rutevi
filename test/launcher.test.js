import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('launcher preserves exit status, strips TypeSafe key, ignores piped stdin and never interprets shell syntax', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'router-jev-test-'));
  try {
    await writeFile(join(directory, 'codex'), `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
console.log(JSON.stringify({ args: process.argv.slice(2), hasKey: Boolean(process.env.TYPESAFE_API_KEY), stdin: readFileSync(0, 'utf8') }));
process.exit(17);
`, { mode: 0o755 });
    const prompt = '--help $(touch /tmp/should-not-exist) `whoami`';
    const result = spawnSync(process.execPath, ['src/cli.js', 'run', '--model', 'gpt-5.6-luna', '--effort', 'low', '--', prompt], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TYPESAFE_API_KEY: 'test-secret' },
      input: 'UNCLASSIFIED INPUT',
      encoding: 'utf8',
    });
    assert.equal(result.status, 17, result.stderr);
    const received = JSON.parse(result.stdout);
    assert.equal(received.hasKey, false);
    assert.equal(received.stdin, '');
    assert.equal(received.args.at(-1), prompt);
    assert.equal(received.args.at(-2), '--');
    assert.ok(result.stderr.includes('explicit'));
    assert.ok(!result.stderr.includes('test-secret'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('OpenCode catalog discovery and execution use the project cwd without leaking credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'router-jev-opencode-test-'));
  try {
    await writeFile(join(directory, 'opencode'), `#!/usr/bin/env node
if (process.argv[2] === 'models') {
  console.log('test/model');
  console.log(JSON.stringify({name:'Test',capabilities:{toolcall:true},variants:{low:{}}},null,2));
} else {
  console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),hasKey:Boolean(process.env.TYPESAFE_API_KEY)}));
  process.exit(19);
}
`, { mode: 0o755 });
    const result = spawnSync(process.execPath, ['src/cli.js', 'run', '--harness', 'opencode', '--cwd', directory, '--model', 'test/model', '--variant', 'low', '--json', 'test'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TYPESAFE_API_KEY: 'test-secret' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 19, result.stderr);
    const received = JSON.parse(result.stdout);
    // macOS canonicalizes /var to /private/var for the child cwd.
    assert.equal(received.cwd, await realpath(directory));
    assert.equal(received.hasKey, false);
    assert.ok(received.args.includes('--format'));
    assert.ok(received.args.includes('--variant'));
    assert.ok(!received.args.includes('--auto'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Codex-only flags are rejected for OpenCode before catalog or routing calls', () => {
  for (const flag of [['--sandbox', 'read-only'], ['--ephemeral'], ['--effort', 'high']]) {
    const result = spawnSync(process.execPath, ['src/cli.js', 'run', '--harness', 'opencode', ...flag, 'test'], {
      cwd: new URL('..', import.meta.url), env: { ...process.env, TYPESAFE_API_KEY: '' }, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /OpenCode no acepta/);
    assert.equal(result.stdout, '');
  }
});
