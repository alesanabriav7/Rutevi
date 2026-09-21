import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { selectTask, startTask } from '../../../src/session/dispatch.js';
import { harnesses } from '../../../src/harnesses.js';

try {
  if (process.env.HERDR_ENV !== '1') throw new Error('Esta sesión no está dentro de Herdr. Abre router-jev session desde una terminal de Herdr; no se lanzó la tarea.');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 64000) throw new Error('Entrada supera 64 KB.');
  }
  const data = JSON.parse(input);
  if (typeof data.prompt !== 'string' || !data.prompt.trim() || (data.context !== undefined && typeof data.context !== 'string')) throw new Error('Se requiere prompt y context opcional.');
  const harness = data.harness ?? 'codex';
  if (!harnesses.includes(harness)) throw new Error('Harness inválido: codex, opencode o claude.');
  const cwd = resolve(data.cwd ?? process.cwd());
  if (!(await stat(cwd)).isDirectory()) throw new Error('cwd debe ser un directorio.');
  const options = { prompt: data.prompt, context: data.context ?? '', harness, cwd };
  const route = await selectTask(options);
  console.log(JSON.stringify(await startTask(options, route), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
