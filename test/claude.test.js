import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routeClaude, claudeArgs } from '../src/claude.js';
import { taskArguments } from '../src/session/dispatch.js';
import { configEnvironment } from '../src/session/task-process.js';

const client = (choice, confidence = 1) => ({ systemOne: async () => ({ model: 'test-jev', answers: { route: { choice, confidence } } }) });

test('Claude routing applies native models and efforts to every Jev category', async () => {
  for (const [category, model, effort] of [['simple', 'sonnet', 'low'], ['standard', 'sonnet', 'medium'], ['complex', 'fable', 'high'], ['unclear', 'fable', 'high']]) {
    const route = await routeClaude({ prompt: 'test' }, client(category));
    assert.equal(route.model, model);
    assert.equal(route.effort, effort);
    assert.equal(route.source, 'jev');
    assert.equal(route.harness, 'claude');
  }
});

test('Claude uncertainty and service fallback stay on Claude; explicit choice bypasses Jev', async () => {
  const uncertain = await routeClaude({ prompt: 'test' }, client('simple', 0.2));
  assert.equal(uncertain.model, 'fable');
  assert.equal(uncertain.effort, 'high');
  assert.equal(uncertain.source, 'low-confidence-fallback');
  const failed = await routeClaude({ prompt: 'test', effort: 'medium' }, { systemOne() { throw new Error('PRIVATE_CONTEXT'); } });
  assert.equal(failed.model, 'fable');
  assert.equal(failed.effort, 'medium');
  assert.equal(failed.source, 'service-error-fallback');
  assert.ok(!JSON.stringify(failed).includes('PRIVATE_CONTEXT'));
  const explicit = await routeClaude({ model: 'opus', effort: 'high' }, { systemOne() { assert.fail('must not call Jev'); } });
  assert.equal(explicit.model, 'opus');
  assert.equal(explicit.source, 'explicit');
});

test('Claude native session receives literal task, context, model, effort and resume without bypass flags', () => {
  const options = { harness: 'claude', prompt: '--test $(echo no) `whoami`', context: 'Task context', session: 'session-id' };
  const args = taskArguments(options, { model: 'sonnet', effort: 'low' });
  assert.deepEqual(args.slice(0, 6), ['--model', 'sonnet', '--effort', 'low', '--resume', 'session-id']);
  assert.equal(args.at(-2), '--');
  assert.ok(args.at(-1).endsWith(options.prompt));
  assert.match(args.at(-1), /Task context/);
  assert.ok(!args.includes('--print'));
  assert.ok(!args.some(arg => /dangerously|permission-mode/.test(arg)));
  assert.deepEqual(configEnvironment({ CLAUDE_CONFIG_DIR: '/profile', ANTHROPIC_API_KEY: 'private' }), { CLAUDE_CONFIG_DIR: '/profile' });
  assert.deepEqual(claudeArgs({ command: 'run', json: true, prompt: 'test' }, { model: 'sonnet', effort: 'low' }).slice(4, -2), ['--print', '--output-format', 'stream-json', '--verbose']);
});

test('Claude CLI run preserves cwd/exit status and rejects foreign harness flags before routing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jev-claude-'));
  try {
    await writeFile(join(directory, 'claude'), `#!/usr/bin/env node
console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),hasKey:Boolean(process.env.TYPESAFE_API_KEY)}));
process.exit(23);
`, { mode: 0o755 });
    const result = spawnSync(process.execPath, ['src/cli.js', 'run', '--harness', 'claude', '--model', 'sonnet', '--effort', 'low', '--cwd', directory, '--json', '--', 'literal $(not-a-command)'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, PATH: directory + ':' + process.env.PATH, TYPESAFE_API_KEY: 'secret-test' } });
    assert.equal(result.status, 23, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.hasKey, false);
    assert.equal(payload.cwd, await realpath(directory));
    assert.equal(payload.args.at(-1), 'literal $(not-a-command)');
    assert.ok(payload.args.includes('--print'));
    for (const flag of [['--sandbox', 'read-only'], ['--ephemeral'], ['--variant', 'high'], ['--policy', '/missing.json']]) {
      const rejected = spawnSync(process.execPath, ['src/cli.js', 'route', '--harness', 'claude', ...flag, 'test'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' } });
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /Claude no acepta|requieren OpenCode/);
      assert.equal(rejected.stdout, '');
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
