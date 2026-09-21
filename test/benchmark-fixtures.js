import vm from 'node:vm';

// Fixed before running the benchmark. These checks are never included in worker prompts.
export const benchmarkTasks = [
  {id:'clamp', priority:'speed', prompt:'Speed matters. Implement solution(value, min, max): clamp a finite number to the inclusive bounds. Throw RangeError when min > max. Do not mutate anything.', checks:`
    check(solution(5,0,10),5); check(solution(-2,0,10),0); check(solution(12,0,10),10);
    check(solution(2.5,2,3),2.5); check(solution(-5,-8,-3),-5); check(solution(9,4,4),4);
    let threw=false; try { solution(1,3,2); } catch(e) { threw=e.name==='RangeError'; } check(threw,true);
  `},
  {id:'intervals', priority:'balanced', prompt:'Implement solution(intervals): merge overlapping or touching closed numeric intervals [start,end], normalizing reversed endpoints. Return sorted non-overlapping intervals. Preserve the input including its nested arrays. Empty input returns [].', checks:`
    check(solution([]),[]); check(solution([[4,1],[2,3],[8,6],[4,6]]),[[1,8]]);
    check(solution([[9,10],[1,2],[5,6]]),[[1,2],[5,6],[9,10]]);
    check(solution([[2,2],[2,2],[1,2]]),[[1,2]]); check(solution([[-3,-8],[-4,0]]),[[-8,0]]);
    const input=[[7,3],[1,2]]; solution(input); check(input,[[7,3],[1,2]]);
    for(let n=1;n<=30;n++) {
      const xs=Array.from({length:n},(_,i)=>[(i*7)%19-9,(i*11)%19-9]);
      const out=solution(xs);
      check(out.every((p,i)=>p[0]<=p[1] && (!i || out[i-1][1]<p[0])),true);
      for(let x=-10;x<=10;x+=0.5) check(out.some(p=>p[0]<=x&&x<=p[1]),xs.some(p=>Math.min(...p)<=x&&x<=Math.max(...p)));
    }
  `},
  {id:'ledger', priority:'quality', prompt:'Correctness is the priority. Implement solution(initial, operations) for an in-memory transfer ledger. initial maps account names to nonnegative safe-integer balances. Each operation has {id,from,to,amount}. Process in order. An already successfully applied id yields "duplicate", regardless of its other fields. Otherwise accept only existing own-property accounts, a positive safe-integer amount, sufficient funds and a safe-integer resulting destination balance. Accepted operations yield "applied" and reserve their id; invalid operations yield "rejected" and do not reserve it. Self-transfers still require sufficient funds, preserve balance and reserve id when accepted. Transfers are atomic. Return {balances,statuses}, preserving input objects. Account names may include __proto__, constructor and toString. IDs are strings.', checks:`
    const op=(id,from,to,amount)=>({id,from,to,amount});
    check(solution({a:10,b:0},[op('x','a','b',3),op('x','bad','b',99),op('y','a','b',9),op('y','a','b',2)]),{balances:{a:5,b:5},statuses:['applied','duplicate','rejected','applied']});
    check(solution({a:5,b:0},[op('s','a','a',5),op('t','a','a',6),op('u','a','b',0),op('v','a','b',1.2),op('w','a','b',-1)]),{balances:{a:5,b:0},statuses:['applied','rejected','rejected','rejected','rejected']});
    check(solution({a:3,b:Number.MAX_SAFE_INTEGER},[op('z','a','b',1)]),{balances:{a:3,b:Number.MAX_SAFE_INTEGER},statuses:['rejected']});
    check(solution({a:Number.MAX_SAFE_INTEGER},[op('z','a','a',1)]),{balances:{a:Number.MAX_SAFE_INTEGER},statuses:['applied']});
    const special=JSON.parse('{"__proto__":5,"constructor":0,"toString":1}');
    check(solution(special,[op('__proto__','__proto__','constructor',2),op('constructor','toString','__proto__',1)]),{balances:JSON.parse('{"__proto__":4,"constructor":2,"toString":0}'),statuses:['applied','applied']});
    check(solution({a:5},[op('q','a','toString',1)]),{balances:{a:5},statuses:['rejected']});
    const initial={a:5,b:0}; const operations=[op('x','a','b',2)]; const before=JSON.stringify([initial,operations]); solution(initial,operations); check(JSON.stringify([initial,operations]),before);
  `},
];

export function gradeSolution(task, source) {
  try {
    // No Node capabilities are supplied. This limits accidental side effects, not a security sandbox.
    const result=vm.runInNewContext(`'use strict'; let checks=0;
      const canonical=x=>Array.isArray(x)?x.map(canonical):x && typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
      function check(a,b){checks++; if(JSON.stringify(canonical(a))!==JSON.stringify(canonical(b))) throw Error('Check '+checks+' failed');}
      ${source}\n${task.checks}\nchecks;`,{}, {timeout:2000});
    return {passed:true,checks:result};
  } catch(error) { return {passed:false,error:error.message}; }
}
