import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {CodexClient} from '../src/session/codex-client.js';
import {directCandidates} from '../src/direct-codex.js';
import {assignTasks} from '../src/assign.js';
import {benchmarkTasks,gradeSolution} from '../test/benchmark-fixtures.js';

const repeats=Number(process.env.BENCH_REPEATS??1);
if(!Number.isInteger(repeats)||repeats<1||repeats>20)throw Error('BENCH_REPEATS must be 1–20');
if(!process.env.TYPESAFE_API_KEY)throw Error('TYPESAFE_API_KEY required');
const policyText=await readFile(new URL('../codex-direct-policy.json',import.meta.url),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
const directory=resolve('artifacts/value-benchmark',new Date().toISOString().replaceAll(':','-'));
await mkdir(directory,{recursive:true});
const work=await mkdtemp(join(tmpdir(),'rutevi-benchmark-'));
const catalogClient=new CodexClient({cwd:work});
let candidates;
try{
  await catalogClient.initialize();let cursor;const models=[];
  do{const page=await catalogClient.call('model/list',{includeHidden:false,...(cursor?{cursor}:{})});models.push(...page.data);cursor=page.nextCursor;}while(cursor);
  candidates=directCandidates(models,JSON.parse(policyText)).map(c=>({...c,kind:'external',harness:'codex'}));
}finally{catalogClient.close();}
for(const id of ['luna-medium','astra-high'])if(!candidates.some(c=>c.id===id))throw Error(`Unavailable baseline: ${id}`);
const rows=[];
const meta={schemaVersion:1,startedAt:new Date().toISOString(),repeats,suiteHash:hash(JSON.stringify(benchmarkTasks)),policyHash:hash(policyText),harnessHash:hash(await readFile(new URL(import.meta.url),'utf8')),codexVersion:execFileSync('codex',['--version'],{encoding:'utf8'}).trim(),candidates,timeoutMs:120000,strategies:['fixed-luna','fixed-astra','jev'],note:'Synthetic coding pilot, no retries. Each fresh thread edits solution.js. Hidden deterministic checks run after execution. Tokens are not dollars; cached input is reported separately. Rank metadata is provisional. No statistical or production-repository claim.'};
await writeFile(join(directory,'manifest.json'),JSON.stringify(meta,null,2));
async function save(){
 await writeFile(join(directory,'results.json'),JSON.stringify({meta,rows},null,2));
 const lines=['# Jev task outcome benchmark','',meta.note,'','| Strategy | Passed / attempted | Wall time (s) | Input tokens | Cached input | Output tokens | Missing usage |','|---|---:|---:|---:|---:|---:|---:|'];
 for(const strategy of meta.strategies){const rs=rows.filter(r=>r.strategy===strategy);const sum=k=>rs.reduce((s,r)=>s+(r.usage?.[k]??0),0);lines.push(`| ${strategy} | ${rs.filter(r=>r.passed).length}/${rs.length} | ${(rs.reduce((s,r)=>s+r.wallMs,0)/1000).toFixed(2)} | ${sum('inputTokens')} | ${sum('cachedInputTokens')} | ${sum('outputTokens')} | ${rs.filter(r=>!r.usage).length} |`);}
 lines.push('','Jev usage is stored separately in results.json; wall time includes routing, App Server startup and execution, excludes grading. Token columns sum known usage only.','', '| Task | Strategy | Model / effort | Passed | Wall seconds | Router ms |','|---|---|---|---|---:|---:|');
 for(const r of rows)lines.push(`| ${r.task} | ${r.strategy} | ${r.model??'none'} / ${r.effort??'none'} | ${r.passed} | ${(r.wallMs/1000).toFixed(2)} | ${r.routing?.latencyMs??0} |`);
 await writeFile(join(directory,'report.md'),lines.join('\n')+'\n');
}
try{
 for(let repeat=0;repeat<repeats;repeat++)for(const [index,task]of benchmarkTasks.entries()){
  const offset=(index+repeat)%3;const order=[...meta.strategies.slice(offset),...meta.strategies.slice(0,offset)];
  for(const strategy of order){
   const cwd=join(work,`${repeat}-${task.id}-${strategy}`);await mkdir(cwd);
   await writeFile(join(cwd,'solution.js'),'function solution() { throw new Error("TODO"); }\n');
   const prompt=`${task.prompt}\n\nEdit solution.js to define the plain JavaScript function solution. No exports or imports. You may use tools to inspect, edit and verify. Do not install packages. Hidden checks will validate correctness after your turn. Finish with a short summary.`;
   const row={repeat,task:task.id,strategy,priority:task.priority,prompt,passed:false};
   const start=performance.now();let client;let timer;
   console.log(JSON.stringify({event:'start',repeat,task:task.id,strategy}));
   try{
    let candidate=candidates.find(c=>c.id===(strategy==='fixed-luna'?'luna-medium':'astra-high'));
    if(strategy==='jev'){
     row.routing=await assignTasks({tasks:[{id:task.id,prompt,priority:task.priority,candidates}]});
     candidate=row.routing.source==='jev'?row.routing.assignments[0]?.candidate:null;
     if(!candidate)throw Error('Jev did not select an executor');
    }
    row.model=candidate.model;row.effort=candidate.effort;
    client=new CodexClient({cwd});timer=setTimeout(()=>client.close(),meta.timeoutMs);
    await client.initialize();
    const {thread}=await client.call('thread/start',{cwd,model:row.model,sandbox:'workspace-write',ephemeral:true});
    row.threadId=thread.id;row.answer='';
    const turn=await client.turn({threadId:thread.id,model:row.model,effort:row.effort,input:[{type:'text',text:prompt}]},event=>{
     if(event.method==='item/agentMessage/delta')row.answer+=event.params.delta;
     if(event.method==='thread/tokenUsage/updated')row.usage=event.params.tokenUsage?.total;
    });
    row.status=turn.status;row.wallMs=performance.now()-start;
    row.source=await readFile(join(cwd,'solution.js'),'utf8');
    row.grade=gradeSolution(task,row.source);row.passed=turn.status==='completed'&&row.grade.passed;
   }catch(error){row.error=error.message;}finally{clearTimeout(timer);client?.close();row.wallMs??=performance.now()-start;}
   rows.push(row);await save();console.log(JSON.stringify({event:'result',task:row.task,strategy,model:row.model,passed:row.passed,wallMs:Math.round(row.wallMs),error:row.error}));
  }
 }
}finally{await save();await rm(work,{recursive:true,force:true});}
console.log(`Report: ${join(directory,'report.md')}`);
