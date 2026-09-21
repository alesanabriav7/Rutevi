#!/usr/bin/env node
import { runLauncherSession } from './session/launcher-session.js';
import { openHerdrTab } from './session/herdr.js';
import { selectTask, startTask } from './session/dispatch.js';
import { runAudit, formatAudit } from './audit.js';
import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { codexArgs } from './codex.js';
import { launchHarness } from './launcher.js';
import { claudeArgs } from './claude.js';
import { harnesses } from './harnesses.js';
import { loadOpenCodeCatalog, loadPolicy, resolveCandidates, openCodeArgs } from './opencode.js';

const help = `rutevi [opciones] — abre la TUI
rutevi <route|run|chat|models|audit|session> [opciones] "petición"

Sin subcomando abre la TUI. router-jev sigue disponible como alias.

  session [tarea]        TUI de Rutevi; con tarea, elige modelo y abre el harness directamente.
  --layout <modo>       session: tareas en tab (por defecto), right o down en Herdr.
  --background          session: conserva el foco en Rutevi al abrir tareas.
  --inline              session: abre aquí; en Herdr abre una pestaña por defecto.
  --session <id>        session: la tarea continúa un hilo cerrado en otra interfaz.
  route                 Consulta Jev y muestra JSON; no inicia el ejecutor.
  run                   Consulta Jev y ejecuta la tarea.
  chat                  Abre CLI interactivo (selección inicial).
  models                Lista candidatos OpenCode y metadatos (sin llamar a Jev).
  audit                 Audita novedades OpenCode; guarda informe y baseline.
  --cached              audit: omite refrescar el catálogo.
  --output <directorio> audit: carpeta de informes y baseline.
  --harness <nombre>    codex (por defecto), opencode o claude.
  --cwd <directorio>    Proyecto de trabajo; por defecto directorio actual.
  --context-file <ruta> Contexto explícito enviado a Jev y al harness.
  --model <modelo>      Fuerza modelo y omite Jev.
  --effort <esfuerzo>   low, medium o high; sobrescribe la selección.
  --variant <variante>  Variante OpenCode; validada contra el modelo seleccionado.
  --preference <modo>   OpenCode: quality (política actual), balanced o fast.
  --policy <ruta>       Política JSON de candidatos OpenCode.
  --agent <nombre>     Agente OpenCode, por ejemplo plan.
  --sandbox <modo>     read-only o workspace-write; si se omite, hereda Codex.
  --json                JSON del informe (audit) o eventos del harness (run).
  --ephemeral           No persiste la sesión de Codex (solo run).
  --help                Muestra esta ayuda.

Requiere TYPESAFE_API_KEY y el harness autenticado. No lee archivos del proyecto
para clasificar. OpenCode valida modelos/variantes contra su catálogo local.
--sandbox y --ephemeral solo aplican a Codex; --effort a Codex y Claude.
OpenCode y Claude heredan sus permisos nativos.
Cada run/chat inicia una sesión nueva; no cambia el modelo de la app abierta.
`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      session: { type: 'string' },
      layout: { type: 'string' },
      background: { type: 'boolean', default: false },
      inline: { type: 'boolean', default: false },
      cached: { type: 'boolean', default: false },
      output: { type: 'string' },
      cwd: { type: 'string', default: process.cwd() },
      harness: { type: 'string', default: 'codex' },
      'context-file': { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      variant: { type: 'string' },
      preference: { type: 'string' },
      policy: { type: 'string' },
      agent: { type: 'string' },
      sandbox: { type: 'string' },
      json: { type: 'boolean', default: false },
      ephemeral: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(help);
  } else {
    const [command = 'session', ...words] = positionals;
    const prompt = words.join(' ').trim();
    if ((values.layout || values.background) && command !== 'session') throw new Error('--layout y --background requieren session.');
    if (values.layout && !['tab', 'right', 'down'].includes(values.layout)) throw new Error('Layout inválido: tab, right o down.');
    if ((values.layout || values.background) && process.env.HERDR_ENV !== '1') throw new Error('--layout y --background requieren Herdr.');
    if (values.session && command !== 'session') throw new Error('--session requiere session.');
    if (values.inline && command !== 'session') throw new Error('--inline requiere session.');
    if (command === 'session' && (values.json || values.ephemeral || (!prompt && values['context-file']))) throw new Error('session no acepta --json/--ephemeral; --context-file requiere una tarea directa.');
    if (command === 'audit') values.harness = 'opencode';
    if (command !== 'audit' && (values.cached || values.output)) throw new Error('--cached y --output requieren audit.');
    if (command === 'audit' && (prompt || values.model || values.variant || values.preference || values.agent || values['context-file'] || values.ephemeral || values.sandbox || values.effort)) throw new Error('audit acepta --cwd, --policy, --output, --cached y --json.');
    if (!harnesses.includes(values.harness)) throw new Error('Harness inválido: codex, opencode o claude.');
    if (!['route', 'run', 'chat', 'models', 'audit', 'session'].includes(command) || (!['models', 'audit', 'session'].includes(command) && !prompt)) throw new Error(help);
    if (command === 'models' && values.harness !== 'opencode') throw new Error('models requiere --harness opencode.');
    if (values.harness === 'opencode' && (values.sandbox || values.ephemeral || values.effort)) throw new Error('OpenCode no acepta --sandbox, --ephemeral ni --effort. Usa sus permisos y --variant.');
    if (values.harness === 'claude' && (values.sandbox || values.ephemeral)) throw new Error('Claude no acepta --sandbox ni --ephemeral de Codex. Hereda sus permisos nativos.');
    if (values.harness !== 'opencode' && (values.variant || values.preference || values.policy || values.agent)) throw new Error('--variant, --preference, --policy y --agent requieren OpenCode.');
    if (values.preference && !['balanced', 'fast', 'quality'].includes(values.preference)) throw new Error('Preferencia inválida: balanced, fast o quality.');
    if (values.effort && !['low', 'medium', 'high'].includes(values.effort)) throw new Error('Esfuerzo inválido.');
    if (values.sandbox && !['read-only', 'workspace-write'].includes(values.sandbox)) throw new Error('Sandbox inválido.');
    if (!['run', 'audit'].includes(command) && (values.json || values.ephemeral)) throw new Error('--json y --ephemeral requieren run.');
    const opensTab = command === 'session' && process.env.HERDR_ENV === '1' && !values.inline;
    if (['chat', 'session'].includes(command) && !opensTab && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error('chat/session requiere una terminal interactiva. Usa run para automatización.');
    const cwd = resolve(values.cwd);
    if (!(await stat(cwd)).isDirectory()) throw new Error('--cwd debe ser un directorio.');
    let context = '';
    if (values['context-file']) context = await readFile(resolve(values['context-file']), 'utf8');
    if (Buffer.byteLength(prompt + context) > 64000) throw new Error('Petición y contexto exceden 64 KB; proporciona un resumen.');
    const options = { ...values, command, prompt, context, cwd };
    if (command === 'session') {
      if (prompt) {
        const route = await selectTask(options);
        console.error(`[router-jev] ${JSON.stringify(route)}`);
        const result = await startTask(options, route);
        if ('tabId' in result && result.tabId) console.log(`${result.harness} abierto en Herdr: ${result.tabId} (${result.paneId}).`);
        else process.exitCode = result.exitCode;
      } else {
        const tab = await openHerdrTab(options);
        if (tab) console.log(`Rutevi abierto en Herdr: ${tab.tabId} (${tab.paneId}).`);
        else await runLauncherSession(options);
      }
    } else if (command === 'audit') {
      const report = await runAudit(options);
      console.log(values.json ? JSON.stringify(report, null, 2) : formatAudit(report));
    } else if (command === 'models') {
      const catalog = await loadOpenCodeCatalog(cwd);
      const policy = await loadPolicy(values.policy);
      const disabled = policy.candidates.filter(item => item.enabled === false)
        .map(item => ({ key: item.key, reason: item.disabledReason }));
      console.log(JSON.stringify({ harness: 'opencode', catalogCount: catalog.length, fallback: policy.fallback, candidates: resolveCandidates(catalog, policy), disabled }, null, 2));
    } else {
      const route = await selectTask(options);
      if (command === 'route') {
        console.log(JSON.stringify(route, null, 2));
      } else {
        console.error(`[router-jev] ${JSON.stringify(route)}`);
        if (command === 'chat') {
          process.exitCode = (await startTask({ ...options, inline: true }, route)).exitCode;
        } else {
          const args = values.harness === 'opencode' ? openCodeArgs(options, route) : values.harness === 'claude' ? claudeArgs(options, route) : codexArgs(options, route);
          process.exitCode = await launchHarness(options, values.harness, args);
        }
      }
    }
  }
} catch (error) {
  console.error(`rutevi: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
