import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, lstat, rm, symlink } from 'node:fs/promises';
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

test('Claude installs the shared skill and removes only its owned link',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jev-claude-install-'));
 const args=[installer,'claude','--claude-home',root];
 try {
  await exec(process.execPath,args);await exec(process.execPath,args);
  assert.equal(await realpath(join(root,'skills/jev')),await realpath(new URL('../plugins/rutevi/skills/jev',import.meta.url)));
  assert.match(await readFile(join(root,'skills/jev/references/requests.md'),'utf8'),/rutevi invoke/);
  await exec(process.execPath,[...args,'--uninstall']);
  await assert.rejects(lstat(join(root,'skills/jev')),{code:'ENOENT'});
 } finally {await rm(root,{recursive:true,force:true});}
});

test('dangling symlink collision fails preflight without partially installing',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jev-dangling-'));
 try {
  await mkdir(join(root,'codex/prompts'),{recursive:true});
  await symlink(join(root,'missing'),join(root,'codex/prompts/jev.md'));
  await assert.rejects(exec(process.execPath,[installer,'codex','--codex-home',join(root,'codex'),'--skills-dir',join(root,'skills')]),/Destino ocupado/);
  await assert.rejects(lstat(join(root,'skills/jev')),{code:'ENOENT'});
  assert.equal((await lstat(join(root,'codex/prompts/jev.md'))).isSymbolicLink(),true);
 } finally {await rm(root,{recursive:true,force:true});}
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
