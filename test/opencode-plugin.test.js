import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createJevPlugin, providerCatalog } from '../src/opencode-plugin.js';

const providers = [{ id:'p', models:{ one:{ name:'One',tool_call:true,variants:{high:{}},headers:{Authorization:'SECRET'},options:{key:'SECRET'}} } }];
function harness(){
 const calls=[];
 const client={
  config:{providers:async()=>({data:{providers}})},
  session:{messages:async()=>({data:[{info:{id:'old',role:'assistant'},parts:[{type:'text',text:'old context'},{type:'tool',text:'DO NOT SEND'},{type:'reasoning',text:'HIDDEN'}]}]})},
  tui:{showToast:async()=>({})},
 };
 const select=async options=>{calls.push(options);return {model:'p/one',variant:'high',source:'jev'};};
 return {client,calls,select,policyLoader:async()=>({})};
}
const output= text=>({message:{id:'new',agent:'plan',model:{providerID:'p',modelID:'manual',variant:'low'}},parts:[{type:'text',text}]});
async function command(hooks,sessionID,text){
 const out=output('template');
 await hooks['command.execute.before']({command:'jev',sessionID,arguments:text},out);
 await hooks['chat.message']({sessionID},out);
 return out;
}

test('OpenCode routes literal command arguments in the same message and preserves agent',async()=>{
 const env=harness(),hooks=await createJevPlugin(env,env);
 const config={};await hooks.config(config);
 assert.equal(config.command.jev.template,'Router Jev');
 assert.ok(!config.command.jev.template.includes('$ARGUMENTS'));
 const out=await command(hooks,'s','fix !`rm ignored` $(literal)');
 assert.equal(env.calls[0].prompt,'fix !`rm ignored` $(literal)');
 assert.equal(env.calls[0].context,'assistant: old context');
 assert.deepEqual(out.message.model,{providerID:'p',modelID:'one',variant:'high'});
 assert.equal(out.message.agent,'plan');
 assert.equal(out.parts[0].text,env.calls[0].prompt);
});

test('OpenCode auto is opt-in per session, off restores manual selection',async()=>{
 const env=harness(),hooks=await createJevPlugin(env,env);
 await hooks['chat.message']({sessionID:'s'},output('ordinary'));assert.equal(env.calls.length,0);
 await command(hooks,'s','auto');assert.equal(env.calls.length,0);
 await hooks['chat.message']({sessionID:'other'},output('ordinary'));assert.equal(env.calls.length,0);
 await hooks['chat.message']({sessionID:'s'},output('ordinary'));assert.equal(env.calls.length,1);
 await command(hooks,'s','off');
 const out=output('manual');await hooks['chat.message']({sessionID:'s'},out);
 assert.equal(env.calls.length,1);assert.equal(out.message.model.modelID,'manual');
});

test('catalog strips secrets and failed routing does not mutate model or task',async()=>{
 assert.ok(!JSON.stringify(providerCatalog(providers)).includes('SECRET'));
 const env=harness();env.select=async()=>{throw new Error('unavailable');};
 const hooks=await createJevPlugin(env,env),out=output('request');
 await hooks['command.execute.before']({command:'jev',sessionID:'s',arguments:'request'},out);
 await assert.rejects(hooks['chat.message']({sessionID:'s'},out),/unavailable/);
 assert.equal(out.message.model.modelID,'manual');
});

test('plugin refuses command collision and auto-routing attachments with text-only evidence',async()=>{
 const env=harness(),hooks=await createJevPlugin(env,env);
 await assert.rejects(hooks.config({command:{jev:{template:'existing'}}}),/existe/);
 await command(hooks,'s','auto');
 const out=output('see attachment');out.parts.push({type:'file',mime:'image/png'});
 await assert.rejects(hooks['chat.message']({sessionID:'s'},out),/adjuntos/);
 assert.equal(env.calls.length,0);
});
