import { mkdir, lstat, symlink, unlink, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  'codex-home': { type: 'string' }, 'skills-dir': { type: 'string' },
  'opencode-home': { type: 'string' }, uninstall: { type: 'boolean', default: false },
} });
try {
  const harness = positionals[0];
  if (!['codex', 'opencode'].includes(harness) || positionals.length !== 1) throw new Error('Uso: node scripts/install-integrations.mjs codex|opencode [--uninstall]');
  const codexHome = resolve(values['codex-home'] ?? process.env.CODEX_HOME ?? resolve(homedir(), '.codex'));
  const skills = resolve(values['skills-dir'] ?? resolve(homedir(), '.agents/skills'));
  const openCodeHome = resolve(values['opencode-home'] ?? resolve(process.env.XDG_CONFIG_HOME ?? resolve(homedir(), '.config'), 'opencode'));
  const entries = harness === 'codex' ? [
    ['integrations/codex/jev', resolve(skills, 'jev')],
    ['integrations/codex/prompts/jev.md', resolve(codexHome, 'prompts/jev.md')],
  ] : [['integrations/opencode/jev.js', resolve(openCodeHome, 'plugins/router-jev.js')]];
  // Preflight every destination before making any changes. Never overwrite a user's file.
  const links = [];
  for (const [relative, target] of entries) {
    const source = await realpath(resolve(root, relative));
    let exists = false;
    try {
      const info = await lstat(target);
      if (!info.isSymbolicLink() || await realpath(target) !== source) throw new Error(`Destino ocupado: ${target}. No se modificó.`);
      exists = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    links.push({ source, target, exists });
  }
  for (const { source, target, exists } of links) {
    if (values.uninstall) { if (exists) await unlink(target); }
    else if (!exists) { await mkdir(dirname(target), { recursive: true }); await symlink(source, target); }
    console.log(`${values.uninstall ? 'Retirado' : 'Enlazado'}: ${target}`);
  }
  console.log('Los archivos fuente permanecen en ' + root);
} catch (error) { console.error(error.message); process.exitCode = 1; }
