import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { Editor, plainText } from '../src/session/editor.js';
import { SessionTui } from '../src/session/tui.js';
import { openHerdrTab } from '../src/session/herdr.js';
import { taskArguments, startTask } from '../src/session/dispatch.js';
import { taskEnvironment } from '../src/session/task-process.js';
import JevLaunch from '../src/session/opencode-launch-plugin.js';

function terminal(columns = 90, rows = 25) {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = output.isTTY = true;
  input.setRawMode = () => {};
  output.columns = columns; output.rows = rows;
  output.on('data', () => {});
  return { input, output };
}

test('editor preserves Unicode graphemes, edits mid-line, restores draft after history and bounds paste', () => {
  const editor = new Editor();
  editor.insert('hola 👩🏽‍💻!');
  editor.key('left'); editor.key('backspace');
  assert.equal(editor.text, 'hola !');
  editor.insert('á');
  assert.equal(editor.text, 'hola á!');
  assert.equal(editor.submit(), 'hola á!');
  editor.insert('mi borrador'); editor.key('up');
  assert.equal(editor.text, 'hola á!');
  editor.key('down'); assert.equal(editor.text, 'mi borrador');
  assert.equal(editor.insert('x'.repeat(48000)), false);
  assert.equal(editor.text, 'mi borrador');
  assert.equal(plainText('\x1b[2Jhola\r\n\x1b]0;title\x07mundo'), 'hola\nmundo');
});

test('launcher TUI keeps input anchored, retains drafts while routing, switches harness and resizes', async () => {
  const streams = terminal();
  const ui = new SessionTui({ cwd: '/project', ...streams });
  try {
    const submitted = [];
    ui.update({ busy: true });
    ui.on('submit', text => submitted.push(text));
    ui.editor.insert('borrador');
    ui.handleKey('\r', { name: 'enter', full: 'enter' });
    assert.deepEqual(submitted, []);
    ui.add('Jev', 'Routing result');
    assert.equal(ui.editor.text, 'borrador');
    let switches = 0;
    ui.on('switchHarness', () => switches++);
    ui.handleKey('\t', { name: 'tab', full: 'tab' });
    assert.equal(switches, 1);
    ui.update({ busy: false, phase: 'Listo', model: 'test-model' });
    ui.handleKey('\n', { name: 'linefeed', full: 'linefeed' });
    ui.editor.insert('segunda línea');
    ui.render();
    let rendered = plainText(ui.screen.screenshot());
    assert.match(rendered, /borrador/);
    assert.match(rendered, /segunda línea/);
    assert.match(rendered, /test-model/);
    ui.handleKey('\r', { name: 'enter', full: 'enter' });
    assert.deepEqual(submitted, ['borrador\nsegunda línea']);
    streams.output.columns = 45; streams.output.rows = 12;
    streams.output.emit('resize');
    await new Promise(resolve => setTimeout(resolve, 350));
    ui.render();
    rendered = plainText(ui.screen.screenshot());
    assert.match(rendered, /Nueva tarea/);
    assert.match(rendered, /Enter abrir/);
    assert.equal(ui.screen.width, 45);
    assert.equal(ui.screen.height, 12);
  } finally { ui.close(); streams.input.destroy(); streams.output.destroy(); }
});

test('real input decoder treats bracketed multiline paste as draft, never auto-submits', async () => {
  const streams = terminal();
  const ui = new SessionTui({ cwd: '/project', ...streams });
  try {
    const submitted = [];
    ui.update({ busy: false });
    ui.on('submit', text => submitted.push(text));
    streams.input.write('\x1b[20');
    streams.input.write('0~primera\r\nsegunda 👩🏽‍💻\x1b[20');
    streams.input.write('1~');
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(submitted, []);
    assert.equal(ui.editor.text, 'primera\nsegunda 👩🏽‍💻');
    streams.input.write('\r');
    assert.deepEqual(submitted, ['primera\nsegunda 👩🏽‍💻']);
  } finally { ui.close(); streams.input.destroy(); streams.output.destroy(); }
});

test('Herdr launches only inside its context, targets caller workspace, quotes literal paths and suppresses recursion', async () => {
  const options = { cwd: "/tmp/a'b $(echo injected)", harness: 'opencode', session: 'ses_123', agent: 'plan' };
  const calls = [];
  const invoke = async (program, args) => {
    assert.equal(program, 'herdr'); calls.push(args);
    if (args[0] === 'pane' && args[1] === 'current') return { stdout: JSON.stringify({ result: { pane: { workspace_id: 'caller-workspace' } } }) };
    if (args[0] === 'tab' && args[1] === 'create') return { stdout: JSON.stringify({ result: { tab: { tab_id: 'returned-tab' }, root_pane: { pane_id: 'returned-pane' } } }) };
    return { stdout: '' }; // pane run has empty stdout in Herdr 0.9.
  };
  assert.equal(await openHerdrTab(options, { env: {}, invoke }), null);
  assert.equal(await openHerdrTab({ ...options, inline: true }, { env: { HERDR_ENV: '1' }, invoke }), null);
  assert.equal(calls.length, 0);
  assert.deepEqual(await openHerdrTab(options, { env: { HERDR_ENV: '1' }, invoke }), { tabId: 'returned-tab', paneId: 'returned-pane' });
  assert.deepEqual(calls[0], ['pane', 'current', '--current']);
  assert.equal(calls[1][3], 'caller-workspace');
  assert.ok(calls[1].includes('--no-focus'));
  const command = calls[2][3];
  // Evaluate only the generated argument quoting using printf, never execute a harness.
  const args = command.slice(command.indexOf(" 'session'"));
  const result = spawnSync('/bin/sh', ['-c', 'printf "%s\\n"' + args], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trimEnd().split('\n'), ['session', '--inline', '--harness', 'opencode', '--cwd', options.cwd, '--session', 'ses_123', '--agent', 'plan']);
  assert.deepEqual(calls[3], ['tab', 'focus', 'returned-tab']);
});

test('Herdr reports a partially started tab without launching twice', async () => {
  let calls = 0;
  const invoke = async (_program, args) => {
    calls++;
    if (args[1] === 'current') return { stdout: '{"result":{"pane":{"workspace_id":"w"}}}' };
    if (args[1] === 'create') return { stdout: '{"result":{"tab":{"tab_id":"t"},"root_pane":{"pane_id":"p"}}}' };
    throw new Error('timeout');
  };
  await assert.rejects(openHerdrTab({ cwd: '/tmp', harness: 'codex' }, { env: { HERDR_ENV: '1' }, invoke }), /pestaña t \(p\)/);
  assert.equal(calls, 3);
});

test('native task arguments include selected model, effort, prompt/context and resume target', () => {
  const options = { cwd: '/project', session: 'ses_1', prompt: '--literal $(echo hello)', context: 'Relevant context' };
  const codex = taskArguments({ ...options, harness: 'codex', sandbox: 'read-only' }, { model: 'gpt-5.6-luna', effort: 'medium' });
  assert.equal(codex[0], 'resume');
  assert.ok(codex.includes('model_reasoning_effort="medium"'));
  assert.equal(codex.at(-2), 'ses_1');
  assert.match(codex.at(-1), /Relevant context/);
  assert.ok(codex.at(-1).endsWith(options.prompt));
  const openCode = taskArguments({ ...options, harness: 'opencode', agent: 'plan' }, { model: 'provider/model', variant: 'high' });
  assert.equal(openCode[0], '/project');
  assert.equal(openCode[openCode.indexOf('--model') + 1], 'provider/model');
  assert.ok(openCode.includes('--prompt'));
  assert.equal(openCode[openCode.indexOf('--session') + 1], 'ses_1');
  assert.ok(!openCode.includes('--auto'));
});

test('task dispatch opens the selected native harness, not another Jev console', async () => {
  const route = { model: 'gpt-5.6-luna', effort: 'low', source: 'jev' };
  let command;
  const result = await startTask({ cwd: '/project', harness: 'codex', prompt: 'do the task' }, route, {
    env: { HERDR_ENV: '1' },
    openTab: async options => { command = options; return { tabId: 't', paneId: 'p' }; },
    launch: () => assert.fail('must use Herdr'),
  });
  assert.equal(result.tabId, 't');
  assert.equal(command.executable, process.execPath);
  const task = JSON.parse(command.args[1]);
  assert.equal(task.harness, 'codex');
  assert.equal(task.args.at(-1), 'do the task');
  assert.deepEqual(task.route, route);
  assert.ok(command.args[0].endsWith('task-process.js'));
});

test('task startup preserves config profiles, strips routing key, merges OpenCode plugins without persisting config', () => {
  const inherited = { TYPESAFE_API_KEY: 'private', OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { '*': 'ask' }, plugin: ['existing'] }) };
  const env = taskEnvironment('opencode', { model: 'provider/model', variant: 'high' }, { CODEX_HOME: '/personal', UNSAFE_EXTRA: 'no' }, inherited);
  assert.equal(env.CODEX_HOME, '/personal');
  assert.equal(env.TYPESAFE_API_KEY, undefined);
  assert.equal(env.UNSAFE_EXTRA, undefined);
  assert.equal(env.ROUTER_JEV_LAUNCH_VARIANT, 'high');
  const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
  assert.equal(config.permission['*'], 'ask');
  assert.equal(config.plugin[0], 'existing');
  assert.match(config.plugin[1], /opencode-launch-plugin.js$/);
  assert.equal(JSON.parse(inherited.OPENCODE_CONFIG_CONTENT).plugin.length, 1);
});

test('OpenCode launch applies the selected variant to the first task and respects later manual choices', async () => {
  const previousModel = process.env.ROUTER_JEV_LAUNCH_MODEL;
  const previousVariant = process.env.ROUTER_JEV_LAUNCH_VARIANT;
  process.env.ROUTER_JEV_LAUNCH_MODEL = 'provider/model';
  process.env.ROUTER_JEV_LAUNCH_VARIANT = 'high';
  try {
    const plugin = await JevLaunch({ client: { tui: { showToast: async () => {} } } });
    const output = { message: { model: { providerID: 'old', modelID: 'old', variant: 'low' } } };
    await plugin['chat.message']({}, output);
    assert.deepEqual(output.message.model, { providerID: 'provider', modelID: 'model', variant: 'high' });
    const next = { message: { model: { providerID: 'manual', modelID: 'other' } } };
    await plugin['chat.message']({}, next);
    assert.equal(next.message.model.providerID, 'manual');
  } finally {
    if (previousModel === undefined) delete process.env.ROUTER_JEV_LAUNCH_MODEL; else process.env.ROUTER_JEV_LAUNCH_MODEL = previousModel;
    if (previousVariant === undefined) delete process.env.ROUTER_JEV_LAUNCH_VARIANT; else process.env.ROUTER_JEV_LAUNCH_VARIANT = previousVariant;
  }
});

test('plain tasks route automatically, Tab changes harness, and cancellation prevents a stale launch', async () => {
  const { EventEmitter } = await import('node:events');
  const { runLauncherSession } = await import('../src/session/launcher-session.js');
  class FakeUi extends EventEmitter {
    add() {}
    update(state) { this.state = { ...this.state, ...state }; }
    close() { this.closed = true; }
  }
  const ui = new FakeUi();
  const pending = [];
  const launched = [];
  const session = runLauncherSession({ cwd: '/project', harness: 'codex' }, {
    createUi: () => ui, env: { HERDR_ENV: '1' },
    select: task => new Promise(resolve => pending.push({ task, resolve })),
    launch: async (task, route) => { launched.push({ task, route }); return { tabId: 'tab', paneId: 'pane' }; },
  });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const route = { model: 'chosen', effort: 'low', source: 'jev' };
  try {
    ui.emit('submit', 'primera tarea');
    assert.equal(pending[0].task.prompt, 'primera tarea');
    assert.equal(launched.length, 0);
    ui.emit('interrupt');
    pending[0].resolve(route);
    await tick();
    assert.equal(launched.length, 0);
    ui.emit('switchHarness');
    ui.emit('switchLayout');
    ui.emit('toggleBackground');
    ui.emit('submit', 'segunda tarea');
    pending[1].resolve(route);
    await tick();
    assert.equal(launched.length, 1);
    assert.equal(launched[0].task.harness, 'opencode');
    assert.equal(launched[0].task.layout, 'right');
    assert.equal(launched[0].task.background, true);
    assert.equal(launched[0].task.context, '');
    assert.equal(launched[0].task.prompt, 'segunda tarea');
    assert.equal(launched[0].route.model, 'chosen');
    assert.ok(!ui.closed, 'router remains available for the next independent task');
    ui.emit('selectHarness', 'claude');
    assert.equal(ui.state.harness, 'claude');
    ui.emit('submit', 'tercera tarea');
    pending[2].resolve({ model: 'sonnet', effort: 'low', source: 'jev' });
    await tick();
    assert.equal(launched[1].task.harness, 'claude');
    ui.emit('switchHarness');
    assert.equal(ui.state.harness, 'codex');
  } finally { ui.emit('quit'); await session; }
});


test('visible destination selector supports keys and clicks without losing the task draft', () => {
  const streams = terminal(48, 20);
  const ui = new SessionTui({ cwd: '/project', ...streams });
  try {
    const selected = [];
    ui.on('selectHarness', harness => { selected.push(harness); ui.update({ harness }); });
    ui.editor.insert('mi tarea pendiente');
    ui.handleKey(undefined, { name: 'f3', full: 'f3' });
    ui.render();
    let rendered = plainText(ui.screen.screenshot());
    assert.match(rendered, /Codex/);
    assert.match(rendered, /OpenCode/);
    assert.match(rendered, /Claude/);
    assert.match(rendered, /Nueva tarea → Claude/);
    assert.equal(ui.editor.text, 'mi tarea pendiente');
    ui.harnessButtons[1].emit('click');
    assert.deepEqual(selected, ['claude', 'opencode']);
    assert.equal(ui.editor.text, 'mi tarea pendiente');
    ui.update({ busy: true });
    ui.handleKey(undefined, { name: 'f1', full: 'f1' });
    ui.harnessButtons[0].emit('click');
    assert.equal(selected.length, 2);
  } finally { ui.close(); streams.input.destroy(); streams.output.destroy(); }
});

test('Herdr splits target the caller, preserve background focus and refuse unusable geometry', async () => {
  const { createHerdrTaskTab } = await import('../src/session/herdr.js');
  const calls = [];
  let width = 160;
  const invoke = async (_program, args) => {
    calls.push(args);
    const result = args[1] === 'current' ? { pane: { workspace_id: 'w', tab_id: 't', pane_id: 'caller' } }
      : args[1] === 'layout' ? { layout: { panes: [{ pane_id: 'caller', rect: { width, height: 40 } }] } }
      : args[1] === 'split' ? { pane: { tab_id: 't', pane_id: 'new' } }
      : args[1] === 'create' ? { tab: { tab_id: 't' }, root_pane: { pane_id: 'new' } } : {};
    return { stdout: JSON.stringify({ result }) };
  };
  const task = { cwd: '/project', label: 'Rutevi', executable: 'printf', args: ['hello'], background: true };
  for (const layout of ['right', 'down', 'tab']) {
    calls.length = 0;
    assert.deepEqual(await createHerdrTaskTab({ ...task, layout }, { invoke }), { tabId: 't', paneId: 'new' });
    const create = calls.find(args => ['split', 'create'].includes(args[1]));
    assert.ok(create.includes('--no-focus'));
    assert.ok(!calls.some(args => args[1] === 'focus'));
    if (layout !== 'tab') assert.deepEqual(create.slice(0, 6), ['pane', 'split', '--pane', 'caller', '--direction', layout]);
  }
  width = 70; calls.length = 0;
  await assert.rejects(createHerdrTaskTab({ ...task, layout: 'right' }, { invoke }), /espacio suficiente/);
  assert.ok(!calls.some(args => ['split', 'run', 'create'].includes(args[1])));
});

test('Herdr controls remain visible on narrow terminals and cannot change an active launch', () => {
  for (const [columns, rows] of [[90, 25], [48, 20], [35, 12]]) {
    const streams = terminal(columns, rows);
    const ui = new SessionTui({ cwd: '/project', herdr: true, ...streams });
    try {
      const events = [];
      ui.on('switchLayout', () => events.push('layout'));
      ui.on('toggleBackground', () => events.push('focus'));
      ui.editor.insert('Mi tarea');
      ui.add('Rutevi', 'Historial visible');
      ui.render();
      const rendered = plainText(ui.screen.screenshot());
      for (const text of [/(?:Ctrl\+O|\^O) Pestaña/, /(?:Ctrl\+G|\^G) Ir/, /Mi tarea/, /Historial visible/]) assert.match(rendered, text);
      ui.handleKey(undefined, { name: 'f4' });
      ui.focusButton.emit('click');
      assert.deepEqual(events, ['layout', 'focus']);
      ui.update({ busy: true });
      ui.handleKey(undefined, { name: 'f4' });
      ui.focusButton.emit('click');
      assert.equal(events.length, 2);
      assert.equal(ui.editor.text, 'Mi tarea');
    } finally { ui.close(); streams.input.destroy(); streams.output.destroy(); }
  }
});

test('decoded Tab, Ctrl+O and Ctrl+G control routing without changing the draft', () => {
  const streams = terminal();
  const ui = new SessionTui({ cwd: '/project', herdr: true, ...streams });
  try {
    const events = [];
    for (const event of ['switchHarness', 'switchLayout', 'toggleBackground']) ui.on(event, () => events.push(event));
    ui.editor.insert('Mi tarea');
    streams.input.write('\t\x0f\x07');
    assert.deepEqual(events, ['switchHarness', 'switchLayout', 'toggleBackground']);
    assert.equal(ui.editor.text, 'Mi tarea');
    ui.update({ busy: true });
    streams.input.write('\x0f\x07');
    assert.equal(events.length, 3);
    ui.update({ busy: false, herdr: false });
    streams.input.write('\x0f\x07');
    assert.equal(events.length, 3);
  } finally { ui.close(); streams.input.destroy(); streams.output.destroy(); }
});
