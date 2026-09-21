import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { fileURLToPath } from 'node:url';

/** @param {NodeJS.ProcessEnv} env */
export const configEnvironment = env => Object.fromEntries(
  ['CODEX_HOME', 'XDG_CONFIG_HOME', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_DIR', 'CLAUDE_CONFIG_DIR']
    .filter(key => env[key]).map(key => [key, env[key]]),
);

/** @param {string} harness @param {import("../types.js").Route} route @param {NodeJS.ProcessEnv} overrides */
export function taskEnvironment(harness, route, overrides = {}, inherited = process.env) {
  const env = { ...inherited, ...configEnvironment(overrides) };
  delete env.TYPESAFE_API_KEY;
  if (harness === 'opencode') {
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT || '{}');
    const plugin = new URL('./opencode-launch-plugin.js', import.meta.url).href;
    config.plugin = [...new Set([...(config.plugin ?? []), plugin])];
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config);
    env.ROUTER_JEV_LAUNCH_MODEL = route.model;
    env.ROUTER_JEV_LAUNCH_VARIANT = route.variant ?? '';
  }
  return env;
}

/** @param {{harness: string, args: string[], cwd: string, route: import("../types.js").Route, environment?: NodeJS.ProcessEnv}} task @returns {Promise<number>} */
export async function launchTaskProcess({ harness, args, cwd, route, environment }, { inherited = process.env, spawnChild = spawn } = {}) {
  const child = spawnChild(harness, args, { cwd, stdio: 'inherit', env: taskEnvironment(harness, route, environment, inherited) });
  const stop = () => child.kill('SIGTERM');
  const interrupt = () => child.kill('SIGINT');
  process.on('SIGTERM', stop); process.on('SIGINT', interrupt);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? 128 + ((signal ? constants.signals[signal] : undefined) ?? 1)));
    });
  } finally { process.off('SIGTERM', stop); process.off('SIGINT', interrupt); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await launchTaskProcess(JSON.parse(process.argv[2])); }
  catch { console.error('No se pudo abrir el harness de la tarea. Revisa su instalación y configuración.'); process.exitCode = 1; }
}
