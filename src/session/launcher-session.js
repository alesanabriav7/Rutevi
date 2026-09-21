import { SessionTui } from './tui.js';
import { selectTask, startTask } from './dispatch.js';
import { harnesses } from '../harnesses.js';

const help = `Escribe la tarea y pulsa Enter. Jev elige modelo y esfuerzo y abre el harness con esa tarea.
En Herdr, Ctrl+O cambia entre pestaña, derecha y abajo. Ctrl+G alterna ir a la tarea o quedarse en Rutevi.
Elige destino en los botones: clic o Tab para alternar Codex / OpenCode / Claude.
Tab alterna destinos. /status muestra la configuración. /quit sale.
Ctrl+J o Alt+Enter añade una línea. ↑↓ recupera tareas. PgUp/PgDn desplaza el historial.
Ctrl+C/Esc sale; durante el routing cancela el lanzamiento pendiente.
Cada tarea es independiente: no se envía a Jev el historial de otras tareas.`;

/** @param {import("../types.js").Options} options */
export async function runLauncherSession(options, { createUi = (/** @type {ConstructorParameters<typeof SessionTui>[0]} */ options) => new SessionTui(options), select = selectTask, launch = startTask, env = process.env } = {}) {
  const herdr = env.HERDR_ENV === '1';
  let layout = options.layout ?? 'tab', background = options.background ?? false;
  const ui = createUi({ cwd: options.cwd, herdr });
  let closed = false, busy = false, launching = false, harness = options.harness, generation = 0;
  /** @type {() => void} */
  let resolveClosed = () => {};
  const done = new Promise(/** @param {(value?: void) => void} resolve */ resolve => { resolveClosed = resolve; });
  const close = () => { if (!closed) { closed = true; generation++; ui.close(); resolveClosed(); } };
  const interrupt = () => {
    if (!busy) { close(); return; }
    if (launching) { ui.add('Jev', 'La apertura ya fue enviada; esperando el resultado para evitar duplicarla.'); return; }
    generation++; busy = false;
    ui.add('Jev', 'Lanzamiento cancelado.');
    ui.update({ busy, phase: 'Listo' });
  };
  process.on('SIGTERM', close); process.on('SIGINT', interrupt);
  ui.on('quit', close); ui.on('interrupt', interrupt);
  /** @param {string} target */
  const selectHarness = target => {
    if (busy) return;
    if (!harnesses.includes(target) || target === harness) return;
    if (options.model || options.session || options.sandbox || options.effort || options.variant || options.agent || options.policy || options.preference) {
      ui.add('Jev', 'El harness está fijado por las opciones de inicio. Abre otra TUI con --harness para cambiarlo.');
      return;
    }
    harness = target;
    ui.update({ herdr, layout, background, harness, model: 'Modelo según tarea', effort: '' });
  };
  ui.on('selectHarness', selectHarness);
  ui.on('switchHarness', () => selectHarness(harnesses[(harnesses.indexOf(harness) + 1) % harnesses.length]));
  ui.on('switchLayout', () => {
    if (busy || !herdr) return;
    const layouts = ['tab', 'right', 'down'];
    layout = layouts[(layouts.indexOf(layout) + 1) % layouts.length];
    ui.update({ layout });
  });
  ui.on('toggleBackground', () => {
    if (busy || !herdr) return;
    background = !background; ui.update({ background });
  });
  ui.on('submit', line => { void submit(line); });
  /** @param {string} line */
  async function submit(line) {
    if (busy || closed) return;
    if (line.trim() === '/quit' || line.trim() === '/exit') { close(); return; }
    if (line.trim() === '/help') { ui.add('Jev', help); return; }
    if (line.trim() === '/status') { ui.add('Jev', JSON.stringify({ harness, cwd: options.cwd, model: options.model ?? 'Jev elige por tarea', herdr, layout, background }, null, 2)); return; }
    if (line.trim().startsWith('/')) { ui.add('Error', 'Escribe la tarea directamente. Comandos: /help, /status, /quit.'); return; }
    busy = true;
    const request = ++generation;
    ui.add('Tú', line);
    ui.update({ busy, phase: 'Eligiendo modelo' });
    try {
      const task = { ...options, harness, layout, background, prompt: line, context: options.context ?? '', inline: false };
      const route = await select(task);
      if (closed || request !== generation) return;
      ui.add('Jev', `${harness} → ${route.model} / ${route.effort ?? route.variant ?? 'default'} · ${route.source}${route.errorType ? ' (' + route.errorType + ')' : ''}`);
      ui.update({ phase: 'Abriendo tarea', model: route.model, effort: route.effort ?? route.variant ?? '' });
      launching = true;
      if (env.HERDR_ENV !== '1') ui.close();
      const result = await launch(task, route);
      if ('tabId' in result && result.tabId) ui.add('Abierta', `Herdr ${result.tabId} · ${result.paneId}\n${background ? 'Puedes lanzar otra tarea desde aquí.' : 'Vuelve a Rutevi para lanzar otra tarea.'}`);
      else { process.exitCode = result.exitCode; close(); }
    } catch (error) {
      if (!closed && request === generation) ui.add('Error', error instanceof Error ? error.message : String(error));
    } finally {
      if (request === generation) { busy = false; launching = false; if (!closed) ui.update({ busy, phase: 'Listo para otra tarea' }); }
      if (ui.closed && !closed) close();
    }
  }
  ui.add('Rutevi', `¿Qué quieres construir?\n\n1. Elige Codex, OpenCode o Claude con Tab o clic.\n2. Describe tu tarea; Jev elige el modelo.\n3. Pulsa Enter para abrirla.${herdr ? '\n\nCtrl+O elige dónde abrir · Ctrl+G cambia el foco.\nCada tarea conserva su propia sesión en Herdr.' : ''}`);
  ui.update({ herdr, layout, background, harness, model: options.model ?? 'Modelo según tarea', effort: options.effort ?? options.variant ?? '', busy: false, phase: 'Listo' });
  try { await done; }
  finally { process.off('SIGTERM', close); process.off('SIGINT', interrupt); close(); }
}
