import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {CodexClient} from '../src/session/codex-client.js';
import {assignTasks} from '../src/assign.js';
const model='gpt-5.6-luna';
const candidates=[
{id:'low',kind:'subagent',model,effort:'low',costRank:1,description:'Same agent at low effort. Suitable for literal recall and factual reporting. Not sufficient for analyzing interacting concurrency invariants.'},
{id:'high',kind:'subagent',model,effort:'high',costRank:2,description:'Same agent at high effort. Suitable for concurrency invariant reasoning and simpler steps.'},
];
const steps=[
{prompt:'Without tools: remember marker COBRE-731 and respond only READY.',observation:'Simple literal memory instruction.',expected:'low',pattern:/READY/},
{prompt:'Without tools: analyze two threads where T1 holds A and waits for B, while T2 holds B and waits for A. Explain whether deadlock exists and give one consistent global lock-ordering rule that prevents it. Include the word DEADLOCK.',observation:'Concurrency reasoning step: establish the correct invariant, not just repeat text.',expected:'high',pattern:/DEADLOCK/},
{prompt:'Without tools: return only the original marker, no explanation.',observation:'Analysis finished. Only recall the previously recorded marker.',expected:'low',pattern:/COBRE-731/},
];
const client=new CodexClient({cwd:process.cwd()});
const timer=setTimeout(()=>client.close(),180000);
const runs=[];
try{
 await client.initialize();
 for(const mode of ['adaptive','fixed-high']){
  const started=await client.call('thread/start',{cwd:process.cwd(),model,sandbox:'read-only',ephemeral:true});
  const threadId=started.thread.id;const history=[];const turns=[];let previousCandidateId='low';
  for(const [i,step] of steps.entries()){
   let effort='high';let routingUsage;
   if(mode==='adaptive'){
    const route=await assignTasks({tasks:[{id:String(i),priority:'economy',prompt:step.prompt,candidates,step:{goal:'Remember a marker, reason about locking, then recall the marker.',observation:step.observation,history:[...history],previousCandidateId}}]});
    console.log(JSON.stringify({step:i,effort:route.assignments[0]?.candidate?.effort,status:route.assignments[0]?.status}));assert.equal(route.source,'jev');const candidate=route.assignments[0].candidate;
    assert.equal(candidate?.effort,step.expected);effort=candidate.effort;previousCandidateId=candidate.id;routingUsage=route.usage;
   }
   let answer='';let tokenUsage;
   const turn=await client.turn({threadId,model,effort,input:[{type:'text',text:step.prompt}]},event=>{
    if(event.method==='item/agentMessage/delta')answer+=event.params.delta;
    if(event.method==='thread/tokenUsage/updated')tokenUsage=event.params.tokenUsage;
   });
   assert.equal(turn.status,'completed');assert.match(answer,step.pattern);
   history.push(`Completed action: ${step.prompt} Verified response: ${answer}`);
   turns.push({effort,answer,tokenUsage,routingUsage,completed:true});
  }
  runs.push({mode,model,threadId,turns});
  console.log(JSON.stringify({mode,efforts:turns.map(t=>t.effort),completed:true,tokenUsage:turns.at(-1).tokenUsage}));
 }
 await mkdir('artifacts',{recursive:true});
 await writeFile('artifacts/effort-smoke.json',JSON.stringify({runs,note:'Single synthetic paired run. Regex checks only test markers, not reasoning quality. Usage is reported raw, not billed dollars or a benchmark.'},null,2));
}finally{clearTimeout(timer);client.close();}
