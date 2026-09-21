import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const cases = [
  { name: 'automatic-glm', flags: [], model: 'opencode-go/glm-5.3-flash', prompt: 'Corrige únicamente el literal JavaScript "Sing in" por "Sign in". Responde solo el literal corregido, sin herramientas.', match: /Sign in/ },
  { name: 'explicit-gpt', flags: ['--model', 'openai/gpt-5.6-luna', '--variant', 'low'], model: 'openai/gpt-5.6-luna', prompt: 'Responde únicamente el resultado de 17 por 23, sin herramientas.', match: /^391$/ },
  { name: 'jev-spark', flags: [], model: 'opencode/muse-spark-1.3', prompt: 'Usa Muse Spark 1.3 para verificar una transformación: trim, minúsculas, eliminar vacíos y duplicados, ordenar. Entrada [" Beta ","alpha","ALPHA",""]. Devuelve solo el array JSON ["alpha","beta"], sin herramientas.', match: /\[\s*"alpha"\s*,\s*"beta"\s*\]/ },
];
for (const item of cases) {
  const { stdout, stderr } = await exec(process.execPath, [cli, 'run', '--harness', 'opencode', '--json', ...item.flags, item.prompt], {
    env: { ...process.env, OPENCODE_PERMISSION: '{"*":"deny"}' },
    timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  });
  const decisionLine = stderr.split('\n').find(line => line.startsWith('[router-jev] '));
  const decision = JSON.parse(decisionLine.slice('[router-jev] '.length));
  const events = stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(decision.model, item.model);
  assert.ok(!events.some(event => event.type === 'error'));
  assert.ok(events.some(event => event.type === 'step_finish'));
  const response = events.filter(event => event.type === 'text').map(event => event.part.text).join('').trim();
  assert.match(response, item.match);
  console.log(JSON.stringify({ name: item.name, model: decision.model, source: decision.source, sessionID: events[0].sessionID, passed: true }));
}
