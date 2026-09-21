import {describe,it,expect} from 'vitest';
import {benchmarkTasks,gradeSolution} from './benchmark-fixtures.js';
import {summarizeRuns} from '../scripts/benchmark-summary.mjs';

describe('benchmark outcome checks',()=>{
  it('rejects placeholders, constant answers and nonterminating solutions',()=>{
    for(const task of benchmarkTasks) {
      expect(gradeSolution(task,'function solution(){return null}').passed).toBe(false);
      expect(gradeSolution(task,'function solution(){throw Error("TODO")}').passed).toBe(false);
    }
    expect(gradeSolution(benchmarkTasks[0],'function solution(){while(true){}}').passed).toBe(false);
  });
  it('accepts correct clamp and catches the omitted invalid-bound case',()=>{
    expect(gradeSolution(benchmarkTasks[0],'function solution(v,a,b){if(a>b)throw new RangeError();return Math.min(b,Math.max(a,v));}').passed).toBe(true);
    expect(gradeSolution(benchmarkTasks[0],'function solution(v,a,b){return Math.min(b,Math.max(a,v));}').passed).toBe(false);
  });
  it('catches interval mutation even if merged output is correct',()=>{
    const code='function solution(xs){xs.forEach(x=>x.sort((a,b)=>a-b)); xs.sort((a,b)=>a[0]-b[0]);const out=[];for(const x of xs){const last=out.at(-1);if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else out.push([...x]);}return out;}';
    expect(gradeSolution(benchmarkTasks[1],code).passed).toBe(false);
    expect(gradeSolution(benchmarkTasks[1],code.replace('xs.forEach','xs=xs.map(x=>[...x]);xs.forEach')).passed).toBe(true);
  });
  it('keeps failed attempt time, missing usage and incompatible runs visible',()=>{
    const run={meta:{startedAt:'a',strategies:['jev'],suiteHash:'v1'},rows:[{strategy:'jev',passed:true,wallMs:100,model:'luna',usage:{inputTokens:10}},{strategy:'jev',passed:false,wallMs:200}]};
    expect(summarizeRuns([run]).strategies[0]).toMatchObject({attempted:2,passed:1,wallMsPerSuccess:300,tokens:{inputTokens:null}});
    expect(()=>summarizeRuns([run,run])).toThrow('Duplicate');
    expect(()=>summarizeRuns([run,{...run,meta:{...run.meta,startedAt:'b',suiteHash:'v2'}}])).toThrow('Incompatible');
  });
  it('checks ledger self-transfers and rejected-id retries against a reference',()=>{
    const source=`function solution(initial,operations){
      const balances={...initial},seen=new Set(),statuses=[];
      for(const {id,from,to,amount} of operations){
        if(seen.has(id)){statuses.push('duplicate');continue;}
        if(!Object.hasOwn(balances,from)||!Object.hasOwn(balances,to)||!Number.isSafeInteger(amount)||amount<=0||balances[from]<amount||(from!==to&&!Number.isSafeInteger(balances[to]+amount))){statuses.push('rejected');continue;}
        if(from!==to){balances[from]-=amount;balances[to]+=amount;}
        seen.add(id);statuses.push('applied');
      }return {balances,statuses};
    }`;
    expect(gradeSolution(benchmarkTasks[2],source).passed).toBe(true);
    expect(gradeSolution(benchmarkTasks[2],source.replace('from!==to&&!Number.isSafeInteger','!Number.isSafeInteger')).passed).toBe(false);
    expect(gradeSolution(benchmarkTasks[2],source.replace("statuses.push('rejected');continue;","seen.add(id);statuses.push('rejected');continue;")).passed).toBe(false);
  });
});
