import assert from 'node:assert/strict';
import { CodexClient } from '../src/session/codex-client.js';
import { routeTask } from '../src/router.js';
import { routingContext } from '../src/session/commands.js';

const client = new CodexClient({cwd:process.cwd()});
const timer = setTimeout(()=>client.close(),120000);
try {
  await client.initialize();
  const started = await client.call('thread/start',{cwd:process.cwd(),sandbox:'read-only',ephemeral:true});
  const threadId=started.thread.id;
  const history=[];
  const prompts = [
    'Sin usar herramientas: recuerda el marcador sintético COBRE-731 y responde únicamente LISTO.',
    'Sin usar herramientas: repite únicamente el marcador que te pedí recordar en el mensaje anterior.',
  ];
  for(const prompt of prompts){
    const route=await routeTask({prompt,context:routingContext(history)});
    assert.equal(route.source,'jev');
    let answer='';
    const turn=await client.turn({threadId,model:route.model,effort:route.effort,input:[{type:'text',text:prompt}]},event=>{
      if(event.method==='item/agentMessage/delta')answer+=event.params.delta;
    });
    assert.equal(turn.status,'completed');
    assert.match(answer,history.length?/COBRE-731/:/LISTO/);
    history.push({role:'user',text:prompt},{role:'assistant',text:answer});
    console.log(JSON.stringify({threadId,model:route.model,effort:route.effort,source:route.source,passed:true}));
  }
  // Explicitly switch model on the same conversation and check recall again.
  let answer='';
  const turn=await client.turn({threadId,model:'gpt-6-astra',effort:'low',input:[{type:'text',text:'Sin herramientas, repite únicamente el marcador original.'}]},event=>{
    if(event.method==='item/agentMessage/delta')answer+=event.params.delta;
  });
  assert.equal(turn.status,'completed');
  assert.match(answer,/COBRE-731/);
  console.log(JSON.stringify({threadId,model:'gpt-6-astra',changedModel:true,recall:true,passed:true}));
} finally {clearTimeout(timer);client.close();}
