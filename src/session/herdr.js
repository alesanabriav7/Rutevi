import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { configEnvironment } from './task-process.js';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../cli.js', import.meta.url));
/** @param {unknown} value */
const shellQuote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";

/** @param {{cwd: string, label: string, executable: string, args: string[], environment?: NodeJS.ProcessEnv, layout?: string, background?: boolean}} task */
export async function createHerdrTaskTab({ cwd, label, executable, args, environment = {}, layout = 'tab', background = false }, { invoke = exec } = {}) {
  /** @param {string[]} args */
  const call = async args => {
    const { stdout } = await invoke('herdr', args, { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
    return stdout;
  };
  if (!['tab', 'right', 'down'].includes(layout)) throw new Error('Layout inválido: tab, right o down.');
  const current = JSON.parse(await call(['pane', 'current', '--current']));
  const workspace = current.result?.pane?.workspace_id;
  if (!workspace) throw new Error('Herdr no devolvió el workspace de la terminal actual.');
  const envArgs = Object.entries(configEnvironment(environment)).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
  const caller = current.result.pane;
  if (layout !== 'tab' && !caller.pane_id) throw new Error('Herdr no devolvió el panel actual.');
  if (layout !== 'tab') {
    const snapshot = JSON.parse(await call(['pane', 'layout', '--pane', caller.pane_id]));
    const rect = snapshot.result?.layout?.panes?.find(/** @param {{pane_id: string}} pane */ pane => pane.pane_id === caller.pane_id)?.rect;
    if (!rect) throw new Error('No se pudo comprobar el espacio del panel. Usa una pestaña.');
    if (layout === 'right' ? rect.width < 100 : rect.height < 30) {
      throw new Error('No hay espacio suficiente para dividir este panel. Elige Pestaña con Ctrl+O.');
    }
  }
  const createArgs = layout === 'tab'
    ? ['tab', 'create', '--workspace', workspace, '--cwd', cwd, '--label', label, '--no-focus', ...envArgs]
    : ['pane', 'split', '--pane', caller.pane_id, '--direction', layout, '--ratio', '0.5', '--cwd', cwd, background ? '--no-focus' : '--focus', ...envArgs];
  const created = JSON.parse(await call(createArgs));
  const tabId = layout === 'tab' ? created.result?.tab?.tab_id : created.result?.pane?.tab_id;
  const paneId = layout === 'tab' ? created.result?.root_pane?.pane_id : created.result?.pane?.pane_id;
  if (!tabId || !paneId) throw new Error('Herdr no devolvió los IDs del destino creado. No se reintentó.');
  try {
    await call(['pane', 'run', paneId, [executable, ...args].map(shellQuote).join(' ')]);
    if (layout === 'tab' && !background) await call(['tab', 'focus', tabId]);
  } catch {
    throw new Error(`Se creó la pestaña ${tabId} (${paneId}), pero no se pudo confirmar el inicio/foco. Inspecciónala antes de reintentar.`);
  }
  return { tabId, paneId };
}

/** @param {import("../types.js").Options} options */
export async function openHerdrTab(options, { env = process.env, invoke = exec } = {}) {
  if (env.HERDR_ENV !== '1' || options.inline) return null;
  const args = [cli, 'session', '--inline', '--harness', options.harness, '--cwd', options.cwd];
  for (const key of /** @type {const} */ (['session', 'model', 'effort', 'sandbox', 'agent', 'variant', 'preference', 'policy'])) {
    if (options[key]) args.push(`--${key}`, options[key] ?? '');
  }
  if (options.layout) args.push('--layout', options.layout);
  if (options.background) args.push('--background');
  return createHerdrTaskTab({ cwd: options.cwd, label: 'Rutevi', executable: process.execPath, args, environment: env }, { invoke });
}
