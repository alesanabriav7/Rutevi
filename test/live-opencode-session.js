import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const server = spawn('opencode',['serve','--hostname','127.0.0.1','--port','0'],{cwd:process.cwd(),env:{...process.env,OPENCODE_PERMISSION:'{"*":"deny"}'},stdio:['ignore','pipe','pipe']});
server.stderr.resume();
const lines=createInterface({input:server.stdout});
try {
 const endpoint=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('OpenCode no inició en 30 segundos')),30000);
  lines.on('line',line=>{const match=line.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});
  server.on('exit',()=>{clearTimeout(timeout);reject(new Error('OpenCode terminó antes de iniciar'));});
  server.on('error',()=>{clearTimeout(timeout);reject(new Error('No se pudo iniciar OpenCode'));});
 });
 const api=async(path,body)=>{
  const response=await fetch(endpoint+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw new Error(`OpenCode ${path}: HTTP ${response.status}`);
  return response.json();
 };
 const commands=await api('/command');assert.ok(commands.some(c=>c.name==='jev'));
 const session=await api('/session',{title:'router-jev synthetic session test'});
 console.log(JSON.stringify({command:'jev',registered:true,sessionID:session.id}));
 const run=async(args,expected)=>{
  const r=await api(`/session/${session.id}/command`,{command:'jev',arguments:args,model:'opencode-go/glm-5.3-flash'});
  if(r.info.error) throw new Error(`OpenCode inference failed: ${r.info.error.name}`);
  const text=r.parts.filter(p=>p.type==='text').map(p=>p.text).join('');
  assert.match(text,expected);
  return r;
 };
 const first=await run('Usa GLM 5.3 Flash. Calcula 17 por 23. Responde solo el número, sin herramientas.',/391/);
 console.log(JSON.stringify({sessionID:session.id,model:first.info.providerID+'/'+first.info.modelID,firstTurn:true,passed:true}));
 const second=await run('Usa Muse Spark 1.3. Repite solo el resultado numérico de la multiplicación del turno anterior, sin herramientas.',/391/);
 assert.equal(second.info.modelID,'muse-spark-1.3');
 assert.equal(second.info.providerID,'opencode');
 console.log(JSON.stringify({sessionID:session.id,model:second.info.providerID+'/'+second.info.modelID,recall:true,changedModel:true,passed:true}));
 await run('auto',/[\s\S]*/);
 const third=await api(`/session/${session.id}/message`,{model:{providerID:'openai',modelID:'gpt-6-astra'},parts:[{type:'text',text:'Sin herramientas, responde únicamente el resultado de 17 por 23.'}]});
 assert.ok(!third.info.error);
 assert.equal(third.info.modelID,'glm-5.3-flash');
 assert.match(third.parts.filter(p=>p.type==='text').map(p=>p.text).join(''),/391/);
 console.log(JSON.stringify({sessionID:session.id,automatic:true,model:third.info.modelID,passed:true}));
 await run('off',/[\s\S]*/);
 const fourth=await api(`/session/${session.id}/message`,{model:{providerID:'openai',modelID:'gpt-5.6-luna'},parts:[{type:'text',text:'Repite solo el resultado de la primera multiplicación de esta conversación, sin herramientas.'}]});
 assert.ok(!fourth.info.error);
 assert.equal(fourth.info.modelID,'gpt-5.6-luna');
 assert.match(fourth.parts.filter(p=>p.type==='text').map(p=>p.text).join(''),/391/);
 console.log(JSON.stringify({sessionID:session.id,automatic:false,model:fourth.info.modelID,recall:true,passed:true}));
} finally {lines.close();server.kill('SIGTERM');}
