import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {assignTasks} from '../src/assign.js';
import {directCandidates} from '../src/direct-codex.js';
import {CodexClient} from '../src/session/codex-client.js';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const fixtures=await read('./fixtures/task-fit.json');
const codexPolicy=await read('../codex-direct-policy.json');
const claudePolicy=await read('../claude-policy.json');
const c=new CodexClient({cwd:process.cwd()});let catalog;
try{await c.initialize();catalog=await c.call('model/list',{includeHidden:false});}finally{c.close();}
const inventories={codex:directCandidates(catalog.data,codexPolicy),claude:claudePolicy.candidates};
const results=[];
for(const host of ['codex','claude'])for(let trial=0;trial<3;trial++)for(let offset=0;offset<fixtures[host].length;offset+=4){
 const batch=fixtures[host].slice(offset,offset+4);
 const pool=inventories[host];
 const reordered=trial===0?pool:trial===1?[...pool].reverse():[...pool.slice(1),pool[0]];
 const tasks=batch.map(({id,prompt,priority})=>({id,prompt,priority,candidates:reordered.map(c=>({...c,kind:'external',harness:host}))}));
 const result=await assignTasks({context:'Independent task-fit evaluation cases; no prior task context. Respect capability requirements even when speed matters.',tasks});
 const checks=batch.map(f=>{
  const a=result.assignments.find(a=>a.taskId===f.id);
  const actual=a?.candidate?.model??null;
  return {host,trial,id:f.id,expected:f.expected,actual,status:a?.status,
   passed:result.source==='jev'&&f.expected.includes(actual)&&(actual!==null||a?.status==='needs-context')};
 });
 results.push({host,trial,result,checks});console.log(JSON.stringify({host,trial,latencyMs:result.latencyMs,checks}));
}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/task-fit-eval.json',JSON.stringify({fixtures,inventories,results,limitations:'Routing policy regression; model rankings not measured execution quality. Codex availability verified via model/list. Claude aliases documented, account execution not verified.'},null,2));
const checks=results.flatMap(r=>r.checks);
console.log(JSON.stringify({passed:checks.filter(c=>c.passed).length,total:checks.length}));
assert.ok(checks.every(c=>c.passed),'Task-fit regressions; inspect full evidence, do not change expectations just to pass.');
