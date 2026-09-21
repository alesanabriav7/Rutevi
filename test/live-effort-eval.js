import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { assignTasks } from '../src/assign.js';

// Prerecorded observations, not worker-generated trajectories or Ares training data.
const candidates = [
  {id:'low',kind:'subagent',model:'same-agentic-model',effort:'low',costRank:1,
    description:'Same agentic model with low reasoning budget. Sufficient for exact edits, running specified commands and reporting verified results. Insufficient for unresolved concurrency design with interacting invariants.'},
  {id:'high',kind:'subagent',model:'same-agentic-model',effort:'high',costRank:2,
    description:'Same agentic model with high reasoning budget. Sufficient for difficult concurrency diagnosis and invariant analysis as well as routine execution.'},
];
const steps = [
  {prompt:'Run the exact existing regression command node --test locks.test.js and capture its output.',observation:'The regression test and command are already identified; no analysis or implementation needed in this step.',expected:'low'},
  {prompt:'Determine the deadlock root cause and a correct lock-ordering invariant before changing code.',observation:'The test reproduces a circular wait. Two earlier local fixes failed; nested lock acquisition across three components violates multiple invariants.',expected:'high'},
  {prompt:'Run the agreed regression command and report the verified test count.',observation:'The invariant analysis and implementation are completed and reviewed. Only execution of node --test locks.test.js and a factual summary remain.',expected:'low'},
];
const trials=[];
for(let trial=0;trial<3;trial++){
  const history=[];let previousCandidateId='low';
  for(const [index,step] of steps.entries()){
    const result=await assignTasks({tasks:[{id:`step-${index}`,priority:'economy',prompt:step.prompt,candidates,
      step:{goal:'Resolve the concurrency regression and verify it.',observation:step.observation,history:[...history],previousCandidateId}}]});
    const decision=result.assignments[0];
    trials.push({trial,index,expected:step.expected,result,passed:result.source==='jev'&&decision.candidate?.id===step.expected});
    previousCandidateId=decision.candidate?.id??previousCandidateId;
    history.push(step.observation);
  }
}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/effort-eval.json',JSON.stringify({steps,candidates,trials},null,2));
console.log(JSON.stringify({passed:trials.filter(t=>t.passed).length,total:trials.length,sequences:[0,1,2].map(n=>trials.filter(t=>t.trial===n).map(t=>t.result.assignments[0].candidate?.effort??null)),
  note:'Repeated synthetic routing checks only; no execution success or token savings inferred.'},null,2));
assert.ok(trials.every(t=>t.passed),'Effort routing regression; inspect artifacts/effort-eval.json');
