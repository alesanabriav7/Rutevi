import { test } from 'vitest';
import assert from 'node:assert/strict';
import { CodexClient } from '../src/session/codex-client.js';
import { parseSessionInput, routingContext } from '../src/session/commands.js';

const fixture = `
const rl = require('node:readline').createInterface({input:process.stdin});
const send = x => process.stdout.write(JSON.stringify(x)+'\\n');
let turns=0, pending;
rl.on('line', line => {
 const m=JSON.parse(line);
 if(m.method==='initialize') send({id:m.id,result:{keyAbsent:!process.env.TYPESAFE_API_KEY}});
 if(m.method==='turn/start') {
  turns++; pending=m;
  send({method:'turn/started',params:{threadId:m.params.threadId,turn:{id:'t'+turns}}});
  send({id:800,method:'item/commandExecution/requestApproval',params:{command:'echo fixture'}});
 }
 if(m.id===800 && m.result) {
  const m2=pending;
  send({id:m2.id,result:{turn:{id:'t'+turns}}});
  send({method:'item/agentMessage/delta',params:{threadId:m2.params.threadId,delta:JSON.stringify({model:m2.params.model,effort:m2.params.effort,decision:m.result.decision})}});
  send({method:'turn/completed',params:{threadId:m2.params.threadId,turn:{id:'t'+turns,status:'completed'}}});
 }
 if(m.method==='bad') send({id:m.id,error:{code:-1,message:'PRIVATE_BODY'}});
});
`;

test('literal /jev supports one task, auto, off and status without altering task data', () => {
  assert.deepEqual(parseSessionInput('/jev auto'), { type: 'mode', automatic: true });
  assert.deepEqual(parseSessionInput('/jev off'), { type: 'mode', automatic: false });
  assert.equal(parseSessionInput('/jev').type, 'status');
  assert.deepEqual(parseSessionInput('/jev do $(nothing)'), { type: 'task', prompt: 'do $(nothing)', route: true });
  assert.equal(parseSessionInput('follow up', true).route, true);
  assert.equal(parseSessionInput('follow up', false).route, false);
  assert.throws(() => parseSessionInput('/model other'));
});

test('routing history is bounded text only', () => {
  const messages = Array.from({length:20},(_,i)=>({role:'user',text:String(i)+'x'.repeat(3000),tools:'secret-tool'}));
  const context = routingContext(messages);
  assert.ok(context.length <= 12000);
  assert.ok(!context.includes('secret-tool'));
});

test('Codex adapter keeps thread identity across model changes and honors approval decisions', async () => {
  const client = new CodexClient({ cwd: process.cwd(), executable: process.execPath, args:['-e',fixture], request:async () => ({decision:'decline'}) });
  try {
    const initialized = await client.call('initialize', {});
    assert.equal(initialized.keyAbsent, true);
    for (const model of ['first','second']) {
      let output='';
      const turn = await client.turn({threadId:'same-thread', model,effort:'low',input:[{type:'text',text:'hello'}]}, event=>{if(event.method==='item/agentMessage/delta')output+=event.params.delta;});
      assert.equal(turn.status,'completed');
      assert.deepEqual(JSON.parse(output),{model,effort:'low',decision:'decline'});
    }
    await assert.rejects(client.call('bad',{}), error => !error.message.includes('PRIVATE_BODY'));
  } finally { client.close(); }
});
