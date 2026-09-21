import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assignTasks } from './assign.js';
import { selectTask, startTask } from './session/dispatch.js';
import { launchHarness } from './launcher.js';
import { codexArgs } from './codex.js';
import { claudeArgs } from './claude.js';
import { openCodeArgs } from './opencode.js';

/** Read bytes before decoding so split UTF-8 input remains intact.
 * @param {AsyncIterable<Buffer|string>} stream */
export async function readRequest(stream) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 64000) throw new Error('Input exceeds 64 KB.');
    chunks.push(buffer);
  }
  try { return /** @type {unknown} */ (JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch { throw new Error('Expected JSON on stdin.'); }
}

/** JSON bridge used by skills. It never opens an interactive TUI inside a tool call.
 * @param {unknown} input */
export async function invoke(input, { select = selectTask, launch = launchHarness, open = startTask, assign = assignTasks } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an object.');
  const data = /** @type {Record<string, unknown>} */ (input);
  if (data.action === 'assign') return { action: 'assign', ...await assign(data) };
  if (!['route', 'run', 'open'].includes(String(data.action))) throw new Error('action must be assign, route, run or open.');
  if (typeof data.prompt !== 'string' || !data.prompt.trim()) throw new Error('prompt is required.');
  if (typeof data.harness !== 'string' || !['codex', 'claude', 'opencode'].includes(data.harness)) throw new Error('harness must be codex, claude or opencode.');
  for (const key of ['context', 'cwd', 'model', 'effort', 'variant', 'agent', 'sandbox']) {
    if (data[key] !== undefined && typeof data[key] !== 'string') throw new Error(`${key} must be text.`);
  }
  if (data.effort !== undefined && !['low', 'medium', 'high'].includes(String(data.effort))) throw new Error('effort must be low, medium or high.');
  if (data.sandbox !== undefined && !['read-only', 'workspace-write'].includes(String(data.sandbox))) throw new Error('Invalid sandbox.');
  if (data.harness !== 'codex' && data.sandbox !== undefined) throw new Error('sandbox requires Codex.');
  if (data.harness !== 'opencode' && (data.variant !== undefined || data.agent !== undefined)) throw new Error('variant and agent require OpenCode.');
  if (data.harness === 'opencode' && data.effort !== undefined) throw new Error('OpenCode uses variant, not effort.');
  if (data.action === 'open' && process.env.HERDR_ENV !== '1') throw new Error('Opening a separate task from a skill requires Herdr. Use run for a noninteractive executor.');
  const cwd = resolve(typeof data.cwd === 'string' ? data.cwd : process.cwd());
  if (!(await stat(cwd)).isDirectory()) throw new Error('cwd must be a directory.');
  /** @type {import('./types.js').Options} */
  const options = { cwd, harness: data.harness, command: data.action === 'run' ? 'run' : 'session', prompt: data.prompt };
  for (const key of /** @type {const} */ (['context', 'model', 'effort', 'variant', 'agent', 'sandbox'])) {
    if (typeof data[key] === 'string') options[key] = data[key];
  }
  const route = await select(options);
  if (data.action === 'route') return { action: 'route', route };
  if (('category' in route && route.category === 'unclear') || route.source === 'no-fit-fallback') throw new Error('Jev could not recover a suitable route. Clarify the task before execution.');
  if (data.action === 'open') return { action: 'open', ...await open(options, route) };
  const args = data.harness === 'codex' ? codexArgs(options, route) : data.harness === 'claude' ? claudeArgs(options, route) : openCodeArgs(options, route);
  const exitCode = await launch(options, data.harness, args);
  return { action: 'run', route, exitCode, status: exitCode === 0 ? 'process-completed' : 'process-failed' };
}
