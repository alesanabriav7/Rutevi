import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadOpenCodeCatalog } from '../src/opencode.js';

// Synthetic access + structured-output check, NOT a coding benchmark.
const ids = process.argv.slice(2);
if (!ids.length) throw new Error('Indica IDs provider/model para probar.');
const catalog = await loadOpenCodeCatalog(process.cwd());
const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const results = [];
for (const id of ids) {
  const model = catalog.find(item => item.id === id);
  if (!model) throw new Error(`Modelo ausente: ${id}`);
  const variant = ['low', 'medium', 'none', 'thinking', 'max'].find(value => model.variants.includes(value));
  const args = [cli, 'run', '--harness', 'opencode', '--model', id, '--json'];
  if (variant) args.push('--variant', variant);
  args.push('Prueba sintética de una función normalizeTags: recorta espacios, convierte a minúsculas, elimina vacíos y duplicados, ordena alfabéticamente. Entrada [" Beta ","alpha","ALPHA","","  beta","GAMMA "," "]. Devuelve únicamente el array JSON resultante. No uses herramientas ni archivos.');
  const started = performance.now();
  let output;
  let exitCode = 0;
  try {
    output = await exec(process.execPath, args, {
      env: { ...process.env, OPENCODE_PERMISSION: '{"*":"deny"}' },
      timeout: 90000, maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    output = { stdout: error.stdout ?? '' };
    exitCode = error.code ?? 1;
  }
  const events = output.stdout.trim().split('\n').flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const apiError = events.find(event => event.type === 'error')?.error;
  const response = events.filter(event => event.type === 'text').map(event => event.part.text).join('').trim();
  let correct = false;
  try {
    correct = JSON.stringify(JSON.parse(response.replace(/^```(?:json)?\s*|\s*```$/g, ''))) === '["alpha","beta","gamma"]';
  } catch { /* Incorrect/missing structured output is a failed check. */ }
  let reason;
  const message = apiError?.data?.message ?? '';
  if (/china|region/i.test(message)) reason = 'region_opt_in_required';
  else if (/balance|credit|billing|payment|fund/i.test(message)) reason = 'billing_or_balance';
  else if (/unauthor|forbidden|access|api key/i.test(message)) reason = 'access_denied';
  else if (/not supported|unsupported/i.test(message)) reason = 'model_unsupported_for_account';
  else if (apiError) reason = apiError.name;
  else if (exitCode) reason = 'process_failed_or_timeout';
  else if (!correct) reason = 'structured_output_mismatch';
  const result = {
    model: id, variant, checkedAt: new Date().toISOString(),
    passed: exitCode === 0 && !apiError && correct && events.some(event => event.type === 'step_finish'),
    status: apiError?.data?.statusCode, reason,
    elapsedMs: Math.round(performance.now() - started),
    sessionID: events[0]?.sessionID,
  };
  results.push(result);
  console.log(JSON.stringify(result));
}
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const reportPath = new URL('../artifacts/model-probes.json', import.meta.url);
let previous = [];
try { previous = JSON.parse(await readFile(reportPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const merged = [...previous.filter(item => !ids.includes(item.model)), ...results];
await writeFile(reportPath, JSON.stringify(merged, null, 2) + '\n');
if (results.some(result => !result.passed)) process.exitCode = 1;
