import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { routeTask, selectRoute } from '../src/router.js';
import { codexArgs } from '../src/codex.js';

test('uncertainty escalates instead of silently choosing the cheap model', () => {
  const result = selectRoute({ choice: 'simple', confidence: 0.3 });
  assert.equal(result.model, 'gpt-6-astra');
  assert.equal(result.source, 'low-confidence-fallback');
});

test('untrusted or malformed routing labels cannot become model arguments', () => {
  for (const answer of [{ choice: '__proto__', confidence: 1 }, { choice: 'simple', confidence: NaN }, null]) {
    assert.throws(() => selectRoute(answer));
  }
});

test('explicit model bypasses Jev entirely', async () => {
  const result = await routeTask({ model: 'gpt-5.6-luna', effort: 'low', prompt: 'test' }, {
    systemOne() { assert.fail('Jev must not be called'); },
  });
  assert.equal(result.source, 'explicit');
  assert.equal(result.effort, 'low');
});

test('Jev receives follow-up context and its decision is applied', async () => {
  const result = await routeTask({ prompt: 'Hazlo', context: 'Corrige un typo' }, {
    async systemOne(request) {
      assert.deepEqual(request.state, { request: 'Hazlo', context: 'Corrige un typo' });
      return { model: 'test-jev', answers: { route: { choice: 'simple', confidence: 1 } } };
    },
  });
  assert.equal(result.model, 'gpt-5.6-luna');
  assert.equal(result.source, 'jev');
});

test('service failure is visible, does not expose the error body, and uses fallback', async () => {
  const result = await routeTask({ prompt: 'test', effort: 'medium' }, {
    async systemOne() { throw new Error('PRIVATE_REQUEST_BODY'); },
  });
  assert.equal(result.source, 'service-error-fallback');
  assert.equal(result.model, 'gpt-6-astra');
  assert.equal(result.effort, 'medium');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_REQUEST_BODY'));
});

test('Codex gets the selected model, context, sandbox and literal prompt', () => {
  const prompt = '--help $(touch /tmp/never) `whoami`';
  const args = codexArgs({ command: 'run', prompt, context: 'A summary', cwd: '/tmp', sandbox: 'read-only', json: true, ephemeral: true }, { model: 'gpt-5.6-luna', effort: 'low' });
  assert.equal(args[args.indexOf('-m') + 1], 'gpt-5.6-luna');
  assert.equal(args[args.indexOf('-c') + 1], 'model_reasoning_effort="low"');
  assert.equal(args[args.indexOf('-s') + 1], 'read-only');
  assert.equal(args.at(-2), '--');
  assert.ok(args.at(-1).includes(prompt));
  assert.ok(args.at(-1).includes('A summary'));
  assert.ok(!args.some(arg => arg.includes('dangerously')));
});

test('invalid CLI input and missing credentials fail before execution', () => {
  for (const args of [['run', '--effort', 'bogus', 'test'], ['route', 'test']]) {
    const result = spawnSync(process.execPath, ['src/cli.js', ...args], { cwd: new URL('..', import.meta.url), env: { ...process.env, TYPESAFE_API_KEY: '' }, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
  }
});
