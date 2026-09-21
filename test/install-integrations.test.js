import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
const installer=new URL('../scripts/install-integrations.mjs',import.meta.url).pathname;

test('installer is repeatable, symlinks stay inside the project, uninstall preserves sources',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jev-install-'));
 const args=[installer,'codex','--codex-home',join(root,'codex'),'--skills-dir',join(root,'skills')];
 try{
  await exec(process.execPath,args);await exec(process.execPath,args);
  const target=join(root,'skills/jev');const source=await realpath(target);
  assert.equal(source, await realpath(new URL('../integrations/codex/jev', import.meta.url)));
  await exec(process.execPath,[...args,'--uninstall']);
  await assert.rejects(lstat(target),{code:'ENOENT'});
  assert.match(await readFile(join(source,'SKILL.md'),'utf8'),/name: jev/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('installer preflight refuses collisions without partially installing',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jev-install-'));
 try{
  await mkdir(join(root,'codex/prompts'),{recursive:true});
  await writeFile(join(root,'codex/prompts/jev.md'),'existing');
  await assert.rejects(exec(process.execPath,[installer,'codex','--codex-home',join(root,'codex'),'--skills-dir',join(root,'skills')]));
  assert.equal(await readFile(join(root,'codex/prompts/jev.md'),'utf8'),'existing');
  await assert.rejects(lstat(join(root,'skills/jev')),{code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});
