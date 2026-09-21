import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { assignTasks } from '../src/assign.js';

// Synthetic capability profiles and ordinal total-cost estimates, not price claims.
// Real Jev request; no worker is launched by this evaluation.
const candidates = [
  { id: 'frontier', kind: 'current', costRank: 3,
    description: 'Frontier coding coordinator. Can implement ordinary work and reason about difficult architecture, concurrency and ambiguous cross-system failures. High ongoing inference cost.' },
  { id: 'modest', kind: 'subagent', costRank: 1,
    description: 'Lower-cost agentic coding worker. Can inspect repository, use shell and tools, edit several files, implement bounded features, diagnose ordinary bugs, write and run tests. Not reliable for novel distributed-system architecture or unresolved concurrency failures after repeated attempts. Short explicit task context; modest handoff cost included in rank.' },
];
const cases = [
  { id: 'pagination', prompt: 'Implement next and previous page controls using the existing API and test boundary pages.', expected: 'modest' },
  { id: 'bug', prompt: 'Fix average([]) returning NaN; the agreed behavior is 0. Add regression tests.', expected: 'modest' },
  { id: 'tests', prompt: 'Add missing tests for invalid dates in the existing validator using current behavior as the contract.', expected: 'modest' },
  { id: 'refactor', prompt: 'Extract duplicated request parsing from two handlers into one helper, preserving behavior and verifying tests.', expected: 'modest' },
  { id: 'docs', prompt: 'Inspect CLI help and update the README examples to match supported arguments.', expected: 'modest' },
  { id: 'architecture', prompt: 'Design a no-downtime migration from a payments monolith to distributed services with idempotency, rollback, and cross-database consistency tradeoffs.', expected: 'frontier' },
  { id: 'escalate', prompt: 'Diagnose intermittent duplicate payments across three services. Two attempts by the modest worker failed; root cause and locking interaction remain unknown.', expected: 'frontier' },
  { id: 'missing-goal', prompt: 'Do that thing.', expected: null },
];
const result = await assignTasks({ context: 'Synthetic evaluation. No preceding conversation. Capabilities and total-cost ranks are supplied assumptions, not a model benchmark.',
  tasks: cases.map(({ id, prompt }) => ({ id, prompt, candidates })) });
const checks = cases.map(c => {
  const decision = result.assignments.find(a => a.taskId === c.id);
  return { id: c.id, expected: c.expected, actual: decision?.candidate?.id ?? null,
    passed: result.source === 'jev' && (decision?.candidate?.id ?? null) === c.expected };
});
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/assign-eval.json', JSON.stringify({ timestamp: new Date().toISOString(), cases, candidates, result, checks }, null, 2));
console.log(JSON.stringify({ model: result.jevModel, latencyMs: result.latencyMs, usage: result.usage, checks,
  modestSelections: checks.filter(c => c.actual === 'modest').length,
  note: 'Routing evaluation only; ordinal cost ranks do not measure monetary savings.' }, null, 2));
assert.ok(checks.every(c => c.passed), 'Live assignment cases failed; inspect artifacts/assign-eval.json');
