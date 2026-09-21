import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assignTasks } from '../src/assign.js';
import { invoke } from '../src/invoke.js';
const cwd = await mkdtemp(join(tmpdir(), 'rutevi-economy-'));
await writeFile(join(cwd,'package.json'), JSON.stringify({type:'module'}));
await writeFile(join(cwd,'average.js'),'export function average(values) { return values.reduce((a, b) => a + b, 0) / values.length; }\n');
await writeFile(join(cwd,'average.test.js'), `import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport {average} from './average.js';\ntest('empty',()=>assert.equal(average([]),0));\ntest('ordinary',()=>assert.equal(average([2,4,6]),4));\ntest('negative',()=>assert.equal(average([-2,-4]),-3));\n`);
const before=spawnSync(process.execPath,['--test'],{cwd,encoding:'utf8'});
if(before.status===0)throw new Error('Fixture must fail before fix');
const prompt='Fix average([]) to return 0 in average.js, preserve other behavior. Inspect the files, modify only average.js, run node --test, and report results. Do not change tests or add dependencies.';
const result=await assignTasks({context:'Isolated JavaScript fixture; exact required behavior and regression tests already exist. Total-cost ranks are relative estimates, not measured prices.',tasks:[{id:'fix',prompt,candidates:[
{id:'frontier',kind:'current',costRank:3,description:'Frontier coordinator capable of implementing this fix; high ongoing inference cost.'},
{id:'luna',kind:'external',harness:'codex',model:'gpt-5.6-luna',effort:'low',costRank:1,description:'Available modest agentic coding executor; can inspect files, edit JavaScript and run node tests for a bounded fix. Small handoff included in cost estimate.'}
]}]});
const selected=result.assignments[0]?.candidate;
console.log(JSON.stringify({cwd,decision:result.assignments[0],latencyMs:result.latencyMs}));
if(selected?.id!=='luna')throw new Error('Expected sufficient modest executor');
const testsBefore=await readFile(join(cwd,'average.test.js'),'utf8');
const receipt=await invoke({action:'run',harness:'codex',model:selected.model,effort:selected.effort,cwd,sandbox:'workspace-write',prompt});
const after=spawnSync(process.execPath,['--test'],{cwd,encoding:'utf8'});
const testsUnchanged=testsBefore===await readFile(join(cwd,'average.test.js'),'utf8');
const evidence={cwd,model:selected.model,receipt,beforeExit:before.status,afterExit:after.status,testsUnchanged,output:after.stdout};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/assign-worker-smoke.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
if(receipt.exitCode!==0||after.status!==0||!testsUnchanged)throw new Error('Worker verification failed');
