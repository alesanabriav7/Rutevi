import {test,expect} from 'vitest';
import {createDirectCodex,directCandidates} from '../src/direct-codex.js';
const policy={candidates:[{id:'cheap',model:'modest',effort:'low',costRank:1,description:'Agentic worker'}]};
const models=[{model:'modest',supportedReasoningEfforts:[{reasoningEffort:'low'}],secret:'SECRET'}];
function harness({status='selected',source='jev',resume=false}={}){
 const calls=[];let request;
 const client={initialize:async()=>calls.push('initialize'),close:()=>calls.push('close'),interrupt:async()=>{},
 call:async(method,_params)=>{
  calls.push(method);
  if(method==='model/list')return {data:models,nextCursor:null};
  return {thread:{id:'thread',turns:resume?[{items:[{type:'userMessage',content:[{type:'text',text:'Remember APPLE'}]},{type:'agentMessage',text:'Remembered'}]}]:[]}};
 },
 turn:async(params,emit)=>{calls.push({turn:params});emit({method:'item/agentMessage/delta',params:{delta:'DONE'}});return {id:'t',status:'completed'};}};
 const assign=async input=>{calls.push('jev');request=input;return {source,assignments:[{status,candidate:status==='selected'?input.tasks[0].candidates[0]:null}]};};
 const session=createDirectCodex({cwd:'/tmp',harness:'codex',...(resume?{session:'thread'}:{})},{client,assign,load:async()=>policy});
 return {session,calls,request:()=>request,client};
}
test('metadata and Jev precede the only execution; original task reaches selected model',async()=>{
 const h=harness();await h.session.initialize();
 expect(h.calls).toEqual(['initialize','model/list','thread/start']);
 const r=await h.session.send('literal $(data)');
 expect(h.calls[3]).toBe('jev');
 expect(h.calls[4].turn).toMatchObject({threadId:'thread',model:'modest',effort:'low',input:[{type:'text',text:'literal $(data)'}]});
 expect(r.answer).toBe('DONE');
 expect(JSON.stringify(h.request())).not.toContain('SECRET');
});
test.each(['needs-context','review-required','no-fit','unavailable'])('%s makes zero execution calls',async status=>{
 const h=harness({status});await h.session.initialize();const r=await h.session.send('task');
 expect(r.status).toBe('not-executed');expect(h.calls).not.toContainEqual(expect.objectContaining({turn:expect.anything()}));
});
test('service failure cannot execute even if it returns a selected candidate',async()=>{
 const h=harness({source:'service-error'});await h.session.initialize();
 expect((await h.session.send('task')).status).toBe('not-executed');
 expect(h.calls.filter(c=>typeof c==='object')).toHaveLength(0);
});
test('same thread receives follow-ups and routing context is extracted in code',async()=>{
 const h=harness();await h.session.initialize();await h.session.send('Remember APPLE');await h.session.send('Repeat it');
 expect(h.request().context).toContain('Remember APPLE');expect(h.request().context).toContain('DONE');
 expect(h.calls.filter(c=>typeof c==='object').map(c=>c.turn.threadId)).toEqual(['thread','thread']);
});
test('resume recovers text without another inference call',async()=>{
 const h=harness({resume:true});await h.session.initialize();await h.session.send('Repeat it');
 expect(h.calls).toContain('thread/resume');expect(h.request().context).toContain('APPLE');
});
test('unavailable efforts are removed, invalid policy rejected',()=>{
 expect(directCandidates(models,{candidates:[{...policy.candidates[0],effort:'high'}]})).toEqual([]);
 expect(()=>directCandidates(models,{candidates:[...policy.candidates,...policy.candidates]})).toThrow();
 expect(()=>directCandidates(models,{candidates:[{...policy.candidates[0],costRank:-1}]})).toThrow();
});
test('closed session and oversized prompts cannot invoke routing',async()=>{
 const h=harness();await h.session.initialize();await expect(h.session.send('x'.repeat(48001))).rejects.toThrow();
 h.session.close();await expect(h.session.send('task')).rejects.toThrow();expect(h.calls).not.toContain('jev');
});

test('closing during Jev evaluation prevents execution',async()=>{
 const h=harness();let release;
 const pending=new Promise(resolve=>{release=resolve;});
 const session=createDirectCodex({cwd:'/tmp',harness:'codex'},{client:h.client,load:async()=>policy,assign:async()=>{
   await pending;return {source:'jev',assignments:[{status:'selected',candidate:policy.candidates[0]}]};
 }});
 await session.initialize();const sending=session.send('task');session.close();release();
 await expect(sending).rejects.toThrow('closed during routing');
 expect(h.calls.filter(c=>typeof c==='object')).toHaveLength(0);
});
