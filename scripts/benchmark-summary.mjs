import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function summarizeRuns(runs) {
 if(!runs.length)throw Error('At least one results.json is required');
 const first=runs[0].meta;const seen=new Set();
 const fields=['schemaVersion','suiteHash','policyHash','harnessHash','codexVersion','timeoutMs'];
 for(const run of runs){
  if(fields.some(k=>run.meta[k]!==first[k])||JSON.stringify(run.meta.candidates)!==JSON.stringify(first.candidates)||JSON.stringify(run.meta.strategies)!==JSON.stringify(first.strategies))throw Error('Incompatible benchmark runs');
  if(seen.has(run.meta.startedAt))throw Error('Duplicate run');seen.add(run.meta.startedAt);
 }
 const rows=runs.flatMap(r=>r.rows);
 return {runs:runs.length,strategies:first.strategies.map(strategy=>{
  const rs=rows.filter(r=>r.strategy===strategy);const passed=rs.filter(r=>r.passed).length;
  const wallMs=rs.reduce((s,r)=>s+r.wallMs,0);
  const tokens={};for(const field of ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens']){
   tokens[field]=rs.every(r=>Number.isFinite(r.usage?.[field]))?rs.reduce((s,r)=>s+r.usage[field],0):null;
  }
  return {strategy,attempted:rs.length,passed,wallMs,wallMsPerSuccess:passed?wallMs/passed:null,tokens,models:[...new Set(rs.map(r=>r.model).filter(Boolean))]};
 }),note:'Descriptive sums, not statistical significance or billed cost. Missing token measurements remain null; failed attempts remain in time per success. Partial runs may have unequal task coverage: inspect results before comparing.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const runs=await Promise.all(process.argv.slice(2).map(async p=>JSON.parse(await readFile(p,'utf8'))));
 console.log(JSON.stringify(summarizeRuns(runs),null,2));
}
