import { test, expect } from 'vitest';
import { assignTasks } from '../src/assign.js';

const current = { id: 'here', kind: 'current', description: 'Already has context; no handoff overhead.' };
const worker = { id: 'worker', kind: 'subagent', model: 'available-model', effort: 'high', description: 'Callable worker for focused analysis.' };
const input = { context: 'Agreed scope', tasks: [
  { id: 'fix', prompt: 'Fix the localized issue', candidates: [current, worker] },
  { id: 'review', prompt: 'Review independent API contract', candidates: [worker] },
] };
const answer = (choice = 'candidate_0', confidence = 0.9) => ({ type: 'choice', choice, confidence, probabilities: { candidate_0: choice === 'candidate_0' ? 1 : 0, candidate_1: choice === 'candidate_1' ? 1 : 0, none: choice === 'none' ? 1 : 0 } });
const fit = (choice = 'suitable', confidence = 0.9) => ({ type: 'choice', choice, confidence,
  probabilities: Object.fromEntries(['suitable', 'uncertain', 'unsuitable'].map(k => [k, k === choice ? 1 : 0])) });
const withFits = answers => ({ fit_0_0: fit(), fit_0_1: fit(), fit_1_0: fit(), ...answers });
const client = answers => ({ systemOne: async () => ({ answers: withFits(answers), model: 'jev-test', usage: {} }) });

test('batches independent assignments and returns only submitted executors', async () => {
  let request;
  const data = structuredClone(input);
  data.tasks[0].candidates[1].headers = { authorization: 'SECRET' };
  const result = await assignTasks(data, { systemOne: async value => {
    request = value;
    return { answers: withFits({ task_0: answer(), task_1: answer() }), model: 'jev-test' };
  } });
  expect(Object.keys(request.questions)).toEqual(['task_0', 'fit_0_0', 'fit_0_1', 'task_1', 'fit_1_0']);
  expect(JSON.stringify(request)).not.toContain('SECRET');
  expect(result).toMatchObject({ source: 'jev', execution: 'host' });
  expect(result.assignments.map(a => a.candidate)).toEqual([current, worker]);
  expect(result.assignments.map(a => a.taskId)).toEqual(['fix', 'review']);
});

test('only no match needs context; a valid low-confidence choice remains selected', async () => {
  const result = await assignTasks(input, client({ task_0: answer('none'), task_1: answer('candidate_0', 0.49) }));
  expect(result.assignments).toMatchObject([
    { status: 'needs-context', candidate: null, reason: 'no-match' },
    { status: 'selected', candidate: worker, confidence: 0.49, reason: 'best-fit' },
  ]);
});

test.each([answer('invented'), answer('candidate_0', NaN), answer('candidate_0', 1.01), undefined])(
  'malformed responses cannot partially authorize execution', async invalid => {
    const result = await assignTasks(input, client({ task_0: answer(), task_1: invalid }));
    expect(result.source).toBe('service-error');
    expect(result.assignments.every(a => a.status === 'unavailable' && a.candidate === null)).toBe(true);
  },
);

test('provider errors do not expose request bodies or invent a fallback model', async () => {
  const result = await assignTasks(input, { systemOne: async () => { throw new Error('SECRET request body'); } });
  expect(result.source).toBe('service-error');
  expect(JSON.stringify(result)).not.toContain('SECRET');
  expect(result.assignments.every(a => a.candidate === null)).toBe(true);
});

test.each([
  null, { tasks: [] }, { tasks: Array(9).fill(input.tasks[0]) },
  { tasks: [input.tasks[0], input.tasks[0]] },
  { tasks: [{ ...input.tasks[0], candidates: [current, current] }] },
  { tasks: [{ ...input.tasks[0], candidates: [] }] },
  { tasks: [{ ...input.tasks[0], candidates: [{ ...worker, kind: 'unknown' }] }] },
  { tasks: [{ ...input.tasks[0], candidates: [{ ...worker, kind: 'external', harness: 'shell' }] }] },
  { ...input, context: 'é'.repeat(32001) },
])('invalid host inventory fails before any API call', async value => {
  let called = false;
  await expect(assignTasks(value, { systemOne: async () => { called = true; } })).rejects.toThrow();
  expect(called).toBe(false);
});

test('a missing key is an actionable error, not a simulated decision', async () => {
  await expect(assignTasks(input)).rejects.toThrow('TYPESAFE_API_KEY');
});

 test.each([0, 0.4, 0.5, 1])('keeps callable choices at confidence %s', async confidence => {
  const result = await assignTasks(input, client({ task_0: answer('candidate_1', confidence), task_1: answer('candidate_0', confidence) }));
  expect(result.assignments.every(a => a.status === 'selected' && a.candidate.id === worker.id)).toBe(true);
});

const economical = { tasks: [{ id: 'fix', priority: 'economy', prompt: 'Fix an ordinary bug and test it', candidates: [
  { ...current, costRank: 3 }, { ...worker, costRank: 1 },
] }] };
test('cost policy chooses a cheaper sufficient worker even when preference favors current', async () => {
  const result = await assignTasks(economical, client({ task_0: answer() }));
  expect(result.assignments[0]).toMatchObject({ status: 'selected', candidate: { id: 'worker' },
    preference: { id: 'here' }, reason: 'lowest-cost-sufficient', costBasis: 'host-relative-total-cost' });
});
test.each(['unsuitable', 'uncertain'])('does not save money by choosing a %s worker', async state => {
  const result = await assignTasks(economical, client({ task_0: answer('candidate_1'), fit_0_1: fit(state) }));
  expect(result.assignments[0].candidate.id).toBe('here');
});
test('low-confidence capability requires review rather than blindly executing', async () => {
  const result = await assignTasks(economical, client({ task_0: answer(), fit_0_0: fit('suitable', 0.4), fit_0_1: fit('uncertain') }));
  expect(result.assignments[0]).toMatchObject({ status: 'review-required', candidate: null });
});
test('known incapability is distinct from missing context', async () => {
  const result = await assignTasks(economical, client({ task_0: answer(), fit_0_0: fit('unsuitable'), fit_0_1: fit('unsuitable') }));
  expect(result.assignments[0]).toMatchObject({ status: 'no-fit', candidate: null });
});
test('partial cost metadata never implies unknown candidates are free', async () => {
  const data = structuredClone(economical);
  delete data.tasks[0].candidates[0].costRank;
  const result = await assignTasks(data, client({ task_0: answer() }));
  expect(result.assignments[0]).toMatchObject({ candidate: { id: 'here' }, costBasis: 'unknown' });
});
test.each([-1, Infinity, 'cheap'])('rejects invalid cost rank %s', async costRank => {
  const data = structuredClone(economical); data.tasks[0].candidates[0].costRank = costRank;
  await expect(assignTasks(data, client({}))).rejects.toThrow('costRank');
});
test.each([{}, { candidate_0: 2, candidate_1: 0, none: 0 }, { candidate_0: 0, candidate_1: 0, none: 0 }])('rejects malformed distributions', async probabilities => {
  const result = await assignTasks(economical, client({ task_0: { ...answer(), probabilities } }));
  expect(result.source).toBe('service-error');
});

test('tiny task stays local when handoff is more expensive', async () => {
  const data = structuredClone(economical);
  data.tasks[0].candidates[0].costRank = 0;
  const result = await assignTasks(data, client({ task_0: answer('candidate_1') }));
  expect(result.assignments[0].candidate.id).toBe('here');
});
test('equal costs use Jev preference, not candidate ordering', async () => {
  const data = structuredClone(economical);
  data.tasks[0].candidates[0].costRank = 1;
  const result = await assignTasks(data, client({ task_0: answer('candidate_1') }));
  expect(result.assignments[0].candidate.id).toBe('worker');
});
test('none with known incapable candidates is no-fit, not a request to restate the goal', async () => {
  const result = await assignTasks(economical, client({ task_0: answer('none'), fit_0_0: fit('unsuitable'), fit_0_1: fit('unsuitable') }));
  expect(result.assignments[0]).toMatchObject({ status: 'no-fit', candidate: null });
});

test('step context is projected without arbitrary fields and marked as next-step scope', async () => {
  const data = structuredClone(economical);
  data.tasks[0].step = { goal: 'Finish migration', observation: 'Design approved; run known tests', history: ['Design reviewed'], previousCandidateId: 'here', secret: 'SECRET' };
  let request;
  const result = await assignTasks(data, { systemOne: async value => {
    request = value; return { answers: withFits({ task_0: answer() }), model: 'jev-test' };
  } });
  expect(request.state.tasks[0].step).toEqual({ goal: 'Finish migration', observation: 'Design approved; run known tests', history: ['Design reviewed'], previousCandidateId: 'here' });
  expect(JSON.stringify(request)).not.toContain('SECRET');
  expect(result.assignments[0]).toMatchObject({ scope: 'next-step', candidate: { id: 'worker' } });
});
test.each([null, {goal:'x',observation:'y',history:Array(9).fill('x')}, {goal:'x',observation:'y',history:[],previousCandidateId:'missing'}, {goal:'x',observation:'',history:[]}])('invalid trajectory fails before routing', async step => {
  const data = structuredClone(economical); data.tasks[0].step = step;
  await expect(assignTasks(data, client({}))).rejects.toThrow();
});
test('equal total cost favors same-model continuity, but not at the expense of capability', async () => {
  const data = structuredClone(economical);
  data.tasks[0].candidates[0] = {...worker,id:'low',effort:'low',costRank:1};
  data.tasks[0].candidates[1] = {...worker,id:'high',effort:'high',model:'other-model',costRank:1};
  data.tasks[0].step = {goal:'Complete project',observation:'Routine remaining work',history:[],previousCandidateId:'low'};
  const result = await assignTasks(data, client({task_0:answer('candidate_1')}));
  expect(result.assignments[0].candidate.id).toBe('low');
  const failed = await assignTasks(data, client({task_0:answer('candidate_1'),fit_0_0:fit('unsuitable')}));
  expect(failed.assignments[0].candidate.id).toBe('high');
});

test.each(['balanced','quality'])('%s preserves best-fit preference over a cheaper sufficient option',async priority=>{
 const data=structuredClone(economical);data.tasks[0].priority=priority;
 const result=await assignTasks(data,client({task_0:answer('candidate_0')}));
 expect(result.assignments[0]).toMatchObject({candidate:{id:'here'},reason:'best-fit',priority});
});
test('speed selects fastest sufficient rather than cheapest',async()=>{
 const data=structuredClone(economical);data.tasks[0].priority='speed';
 data.tasks[0].candidates[0].latencyRank=1;data.tasks[0].candidates[1].latencyRank=3;
 const result=await assignTasks(data,client({task_0:answer('candidate_1')}));
 expect(result.assignments[0]).toMatchObject({candidate:{id:'here'},reason:'lowest-latency-sufficient'});
 const restricted=await assignTasks(data,client({task_0:answer('candidate_1'),fit_0_0:fit('unsuitable')}));
 expect(restricted.assignments[0].candidate.id).toBe('worker');
});
test('speed with incomplete latency evidence defers to Jev rather than inventing measurements',async()=>{
 const data=structuredClone(economical);data.tasks[0].priority='speed';data.tasks[0].candidates[0].latencyRank=1;
 const result=await assignTasks(data,client({task_0:answer('candidate_1')}));
 expect(result.assignments[0]).toMatchObject({candidate:{id:'worker'},reason:'best-fit',latencyBasis:'unknown'});
});
test('unknown priority or invalid latency metadata fails before a request',async()=>{
 const data=structuredClone(economical);data.tasks[0].priority='cheapest-always';
 await expect(assignTasks(data,client({}))).rejects.toThrow('priority');
 data.tasks[0].priority='speed';data.tasks[0].candidates[0].latencyRank=-1;
 await expect(assignTasks(data,client({}))).rejects.toThrow('latencyRank');
});
