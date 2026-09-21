import { test } from 'vitest';
import assert from 'node:assert/strict';
import { auditModels } from '../src/audit.js';

const model = { id: 'p/one', toolcall: true, releaseDate: '2026-09-01', variants: ['low', 'high'], inputCost: 1 };
const policy = { reviewedAt: '2026-09-20', candidates: [{ key: 'one', models: ['p/one'], variant: 'high' }, { key: 'blocked', models: ['p/blocked'], enabled: false, disabledReason: 'region' }] };
const now = new Date('2026-09-20T12:00:00Z');

test('first observation is a baseline, not evidence of new releases', () => {
  const report = auditModels([model], policy, null, now);
  assert.equal(report.firstRun, true);
  assert.deepEqual(report.added, []);
  assert.equal(report.needsReview, false);
});

test('detects additions, removals, metadata changes and broken variants', () => {
  const report = auditModels([{ ...model, inputCost: 2, variants: ['low'] }, { ...model, id: 'p/new', releaseDate: '2026-09-21' }], policy, { catalog: [model, { ...model, id: 'p/removed' }] }, now);
  assert.deepEqual(report.added.map(item => item.id), ['p/new']);
  assert.deepEqual(report.removed, ['p/removed']);
  assert.deepEqual(report.changed, [{ id: 'p/one', fields: ['inputCost', 'variants'] }]);
  assert.equal(report.issues.length, 1);
  assert.equal(report.releasedSinceReview.length, 1);
});

test('unknown launch dates remain reviewable; disabled candidates stay disabled', () => {
  const original = JSON.stringify(policy);
  const report = auditModels([model, { ...model, id: 'p/unknown', releaseDate: undefined }, { ...model, id: 'p/blocked' }], policy, null, now);
  assert.deepEqual(report.unreviewed.map(item => item.id), ['p/unknown']);
  assert.deepEqual(report.releasedSinceReview, []);
  assert.equal(report.disabled[0].reason, 'region');
  assert.equal(JSON.stringify(policy), original);
});

test('variant ordering is not a change; stale review still flagged', () => {
  const report = auditModels([{ ...model, variants: ['high', 'low'] }], policy, { catalog: [model] }, new Date('2026-10-04T12:00:00Z'));
  assert.deepEqual(report.changed, []);
  assert.equal(report.reviewAgeDays, 14);
  assert.equal(report.needsReview, true);
});
