import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseCatalog, resolveCandidates, routeOpenCode, openCodeArgs } from '../src/opencode.js';

const catalog = [
  { id: 'go/flash', variants: ['low', 'high'], toolcall: true, status: 'active' },
  { id: 'openai/strong', variants: ['medium', 'high'], toolcall: true, status: 'active' },
];
const policy = { fallback: 'strong', candidates: [
  { key: 'flash', models: ['go/missing', 'go/flash'], description: 'Simple tasks', variant: 'low' },
  { key: 'strong', models: ['openai/strong'], description: 'Complex tasks', variant: 'high' },
] };
const mockAnswer = (choice, confidence = 0.9) => ({
  async systemOne() { return { model: 'jev-test', answers: { model: { choice, confidence } } }; },
});

test('catalog parsing strips provider credentials and handles nested metadata', () => {
  const object = { name: 'Flash', release_date: '2026-09-02', headers: { Authorization: 'SECRET' }, options: { apiKey: 'SECRET' }, capabilities: { toolcall: true }, variants: { low: {}, hidden: { disabled: true } } };
  const parsed = parseCatalog(`provider/flash\n${JSON.stringify(object, null, 2)}\n`);
  assert.equal(parsed[0].id, 'provider/flash');
  assert.equal(parsed[0].releaseDate, '2026-09-02');
  assert.deepEqual(parsed[0].variants, ['low']);
  assert.ok(!JSON.stringify(parsed).includes('SECRET'));
  assert.throws(() => parseCatalog('changed output format'));
});

test('quality-first policy passes reviewed evidence and permits explicit preference overrides', async () => {
  const configured = structuredClone(policy);
  configured.defaultPreference = 'quality';
  configured.reviewedAt = '2026-09-20';
  configured.candidates[0].evidence = 'Official release notes';
  const inputCatalog = catalog.map(item => ({ ...item, releaseDate: '2026-09-02' }));
  for (const override of [undefined, 'fast']) {
    const result = await routeOpenCode({ prompt: 'test', preference: override }, inputCatalog, configured, {
      async systemOne(request) {
        assert.equal(request.state.preference, override ?? 'quality');
        assert.equal(request.questions.model.criteria.flash.releaseDate, '2026-09-02');
        assert.equal(request.questions.model.criteria.flash.evidence, 'Official release notes');
        return { answers: { model: { choice: 'flash', confidence: 1 } } };
      },
    });
    assert.equal(result.preference, override ?? 'quality');
  }
});

test('candidate resolution chooses existing providers and rejects unavailable fallback', () => {
  assert.equal(resolveCandidates(catalog, policy)[0].id, 'go/flash');
  assert.throws(() => resolveCandidates(catalog.slice(0, 1), policy), /fallback/);
  const invalid = structuredClone(policy);
  invalid.candidates[0].variant = 'max';
  assert.throws(() => resolveCandidates(catalog, invalid), /Variante/);
});

test('unsupported tool models and duplicate keys cannot enter the automatic pool', () => {
  assert.throws(() => resolveCandidates(catalog.map(item => ({ ...item, toolcall: false })), policy));
  assert.throws(() => resolveCandidates(catalog, { ...policy, candidates: [...policy.candidates, policy.candidates[0]] }));
});

test('known inaccessible models stay out of Jev choices even when listed in the catalog', () => {
  const configured = structuredClone(policy);
  configured.candidates[0].enabled = false;
  assert.deepEqual(resolveCandidates(catalog, configured).map(item => item.key), ['strong']);
});

test('Jev chooses an available candidate with its provider-specific variant', async () => {
  const result = await routeOpenCode({ prompt: 'test' }, catalog, policy, mockAnswer('flash'));
  assert.equal(result.model, 'go/flash');
  assert.equal(result.variant, 'low');
  assert.equal(result.source, 'jev');
});

test('overlapping adequate candidates do not force an expensive escalation', async () => {
  const result = await routeOpenCode({ prompt: 'test' }, catalog, policy, mockAnswer('flash', 0.3));
  assert.equal(result.model, 'go/flash');
  assert.equal(result.source, 'jev');
});

test('unknown label, no fit and service errors use the declared fallback', async () => {
  for (const client of [mockAnswer('fabricated'), mockAnswer('no_fit'), { async systemOne() { throw new Error('SECRET'); } }]) {
    const result = await routeOpenCode({ prompt: 'test' }, catalog, policy, client);
    assert.equal(result.model, 'openai/strong');
    assert.ok(result.source.endsWith('fallback'));
    assert.ok(!JSON.stringify(result).includes('SECRET'));
  }
});

test('explicit model skips Jev but still validates model and variant', async () => {
  const client = { systemOne() { assert.fail('Should not call Jev'); } };
  const result = await routeOpenCode({ model: 'go/flash', variant: 'high' }, catalog, policy, client);
  assert.equal(result.source, 'explicit');
  assert.equal(result.variant, 'high');
  await assert.rejects(routeOpenCode({ model: 'go/missing' }, catalog, policy, client), /ausente/);
  await assert.rejects(routeOpenCode({ model: 'go/flash', variant: 'medium' }, catalog, policy, client), /Variante/);
});

test('context, preferences and whitelisted catalog metadata reach Jev', async () => {
  await routeOpenCode({ prompt: 'Hazlo', context: 'A bounded coding task', preference: 'fast' }, catalog, policy, {
    async systemOne(request) {
      assert.deepEqual(request.state, { request: 'Hazlo', context: 'A bounded coding task', preference: 'fast' });
      assert.equal(request.questions.model.criteria.flash.model, 'go/flash');
      return { answers: { model: { choice: 'flash', confidence: 1 } } };
    },
  });
});

test('OpenCode receives its own flags, full context and literal prompt', () => {
  const result = openCodeArgs({ command: 'chat', prompt: '--help $(whoami)', context: 'context', cwd: '/tmp', agent: 'plan' }, { model: 'go/flash', variant: 'low' });
  assert.ok(result.includes('--interactive'));
  assert.ok(result.includes('--variant'));
  assert.ok(result.includes('--agent'));
  assert.equal(result.at(-2), '--');
  assert.ok(result.at(-1).includes('--help $(whoami)'));
  assert.ok(result.at(-1).includes('context'));
  assert.ok(!result.includes('--auto'));
  assert.ok(!result.includes('-c'));
});
