import { routeTask } from '../router.js';
import { loadOpenCodeCatalog, loadPolicy, routeOpenCode } from '../opencode.js';
import { codexArgs } from '../codex.js';
import { claudeArgs, routeClaude } from '../claude.js';
import { launchTaskProcess, configEnvironment } from './task-process.js';
import { createHerdrTaskTab } from './herdr.js';
import { fileURLToPath } from 'node:url';

/** @param {import("../types.js").Options} options */
export async function selectTask(options) {
  if (!options.prompt?.trim()) throw new Error('Escribe la tarea que quieres abrir.');
  if (Buffer.byteLength(options.prompt + (options.context ?? '')) > 64000) throw new Error('Tarea y contexto exceden 64 KB.');
  if (options.harness === 'claude') return routeClaude(options);
  if (options.harness === 'opencode') {
    const [catalog, policy] = await Promise.all([loadOpenCodeCatalog(options.cwd), loadPolicy(options.policy)]);
    return routeOpenCode(options, catalog, policy);
  }
  return routeTask(options);
}

/** @param {import("../types.js").Options} options @param {import("../types.js").Route} route */
export function taskArguments(options, route) {
  if (options.harness === 'claude') return claudeArgs({ ...options, command: 'chat' }, route);
  if (options.harness === 'opencode') {
    const prompt = options.context ? `Contexto proporcionado por el usuario:\n${options.context}\n\nPetición:\n${options.prompt}` : options.prompt ?? '';
    const args = [options.cwd, '--model', route.model, '--prompt', prompt];
    for (const key of /** @type {const} */ (['session', 'agent'])) if (options[key]) args.push(`--${key}`, options[key] ?? '');
    return args;
  }
  const args = codexArgs({ ...options, command: 'chat' }, route);
  if (options.session) {
    args.unshift('resume'); args.splice(args.indexOf('--') + 1, 0, options.session);
  }
  return args;
}

/** @param {import("../types.js").Options} options @param {import("../types.js").Route} route */
export async function startTask(options, route, { env = process.env, openTab = createHerdrTaskTab, launch = launchTaskProcess } = {}) {
  const args = taskArguments(options, route);
  const task = { harness: options.harness, args, cwd: options.cwd, route, environment: configEnvironment(env) };
  if (env.HERDR_ENV === '1' && !options.inline) {
    const entry = fileURLToPath(new URL('./task-process.js', import.meta.url));
    const tab = await openTab({ cwd: options.cwd, layout: options.layout, background: options.background, label: `Rutevi · ${options.harness} · ${route.model.split('/').at(-1)}`, executable: process.execPath, args: [entry, JSON.stringify(task)] });
    return { ...tab, harness: options.harness, route };
  }
  const exitCode = await launch(task);
  return { harness: options.harness, route, exitCode };
}
