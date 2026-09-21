import blessed from 'blessed';
import { EventEmitter } from 'node:events';
import { Editor, plainText } from './editor.js';
import { terminalInput } from './terminal-input.js';
import { harnessLabels, harnesses } from '../harnesses.js';

/** @type {Record<string, number>} */
const colors = { Rutevi: 36, Tú: 36, Jev: 35, Abierta: 32, Error: 31 };
/** @param {string} text @param {string|number} color */
const tint = (text, color) => `\x1b[${color}m${text}\x1b[0m`;
// Blessed exposes unicode helpers at runtime but omits them from its declarations.
const blessedUnicode = /** @type {typeof blessed & {unicode: {strWidth(text: string): number}}} */ (blessed).unicode;
const commands = ['/help', '/status', '/quit'];

export class SessionTui extends EventEmitter {
  /** @param {{cwd: string, herdr?: boolean, input?: NodeJS.ReadStream, output?: NodeJS.WriteStream}} options */
  constructor({ cwd, herdr = false, input = process.stdin, output = process.stdout }) {
    super();
    this.editor = new Editor();
    this.messages = /** @type {{role: string, text: string}[]} */ ([]);
    this.state = { herdr, layout: 'tab', background: false, phase: 'Listo', model: 'Modelo según tarea', harness: 'codex', effort: '', busy: false };
    this.follow = true;
    this.terminalInput = terminalInput(input, text => {
      if (text === null || !this.editor.insert(text)) this.add('Error', 'El pegado supera el límite de 48 KB; no se insertó.');
      this.schedule();
    });
    this.screen = blessed.screen({ input: this.terminalInput.input, output, smartCSR: true, fullUnicode: true, dockBorders: true, title: 'Rutevi', autoPadding: true });
    /** @param {blessed.Widgets.BoxOptions} options */
    const box = options => blessed.box({ parent: this.screen, tags: false, ...options });
    this.header = box({ top: 0, left: 1, right: 1, height: 2 });
    this.cwd = plainText(cwd);
    this.transcript = box({ top: 3, left: 1, right: 1, bottom: 5, scrollable: true, alwaysScroll: true, mouse: true, scrollbar: { ch: '│', style: { fg: 'gray' } } });
    this.status = box({ bottom: 4, left: 1, right: 1, height: 1 });
    this.harnessButtons = harnesses.map((harness) => {
      const button = box({ bottom: 4, left: 1, width: harnessLabels[harness].length + 8, height: 1, mouse: true });
      button.on('click', () => { if (!this.state.busy) this.emit('selectHarness', harness); });
      return button;
    });
    this.layoutButton = box({ height: 1, mouse: true });
    this.focusButton = box({ height: 1, mouse: true });
    this.layoutButton.on('click', () => { if (!this.state.busy) this.emit('switchLayout'); });
    this.focusButton.on('click', () => { if (!this.state.busy) this.emit('toggleBackground'); });
    this.input = box({ bottom: 1, left: 0, right: 0, height: 3, border: 'line', padding: { left: 1, right: 1 }, scrollable: true, style: { border: { fg: 'cyan' } } });
    this.footer = box({ bottom: 0, left: 1, right: 1, height: 1, style: { fg: 'gray' } });
    this.screen.program.write('\x1b[?2004h');
    this.screen.on('keypress', (ch, key) => this.handleKey(ch, key));
    this.transcript.on('wheeldown', () => this.scroll(3));
    this.transcript.on('wheelup', () => this.scroll(-3));
    this.screen.on('resize', () => this.schedule());
    this.frame = 0;
    this.spinner = setInterval(() => { if (this.state.busy) { this.frame++; this.schedule(); } }, 120);
    this.spinner.unref();
    this.render();
  }

  /** @param {Partial<SessionTui["state"]>} state */
  update(state) { Object.assign(this.state, state); this.schedule(); }
  /** @param {string} role */
  add(role, text = '') {
    const message = { role, text: plainText(text) };
    this.messages.push(message);
    this.messages = this.messages.slice(-400);
    this.schedule();
    return message;
  }
  /** @param {{text: string}} message @param {string} delta */
  append(message, delta) {
    message.text = (message.text + plainText(delta)).slice(-200000);
    this.schedule();
  }
  /** @param {number} lines */
  scroll(lines) {
    this.transcript.scroll(lines);
    this.follow = this.transcript.getScrollPerc() >= 100;
    this.screen.render();
  }
  /** @param {string|undefined} ch @param {Partial<blessed.Widgets.Events.IKeyEventArg>} key */
  handleKey(ch, key = {}) {
    if (this.closed || key.name === 'return') return;
    const name = key.full ?? key.name ?? '';
    if (['f1', 'f2', 'f3'].includes(key.name ?? '')) {
      if (!this.state.busy) this.emit('selectHarness', harnesses[Number(key.name?.slice(1)) - 1]);
      return;
    }
    if (['C-o', 'C-g'].includes(name)) {
      if (!this.state.busy && this.state.herdr) this.emit(name === 'C-o' ? 'switchLayout' : 'toggleBackground');
      return;
    }
    if (['f4', 'f5'].includes(key.name ?? '')) {
      if (!this.state.busy && this.state.herdr) this.emit(key.name === 'f4' ? 'switchLayout' : 'toggleBackground');
      return;
    }
    if (name === 'C-c' || name === 'escape') {
      this.emit('interrupt');
      return;
    }
    if (name === 'C-d' && !this.editor.text) { this.emit('quit'); return; }
    if (key.name === 'pageup' || key.name === 'pagedown') { this.scroll((key.name === 'pageup' ? -1 : 1) * Math.max(1, Number(this.transcript.height) - 2)); return; }
    if (name === 'C-l') { this.follow = true; this.screen.realloc(); this.schedule(); return; }
    if ((key.name === 'enter' && (key.meta || key.shift)) || name === 'C-j' || key.name === 'linefeed') this.editor.insert('\n');
    else if (key.name === 'enter') {
      if (!this.state.busy && this.editor.text.trim()) {
        const value = this.editor.submit();
        this.follow = true;
        this.emit('submit', value);
      }
    } else if (key.name === 'tab') {
      const matches = commands.filter(command => command.startsWith(this.editor.text));
      if (this.editor.text.startsWith('/') && matches.length === 1) this.editor.set(matches[0]);
      else if (!this.editor.text.startsWith('/')) this.emit('switchHarness');
    } else if (ch && !key.ctrl && !key.meta && !['backspace', 'delete'].includes(key.name ?? '')) this.editor.insert(ch);
    else this.editor.key(name);
    this.schedule();
  }
  schedule() {
    if (!this.timer && !this.closed) this.timer = setTimeout(() => { this.timer = undefined; this.render(); }, 25);
  }
  render() {
    if (this.closed) return;
    const { model, effort, harness, phase, busy, herdr, layout, background } = this.state;
    const height = Math.max(3, Math.min(6, this.editor.text.split('\n').length + 2, Math.floor(Number(this.screen.height) / 3)));
    this.input.height = height;
    const compact = Number(this.screen.height) < 18;
    const shortLabels = compact && Number(this.screen.width) < 45;
    const stacked = Number(this.screen.width) < 45 && !compact;
    const selectorHeight = stacked ? 3 : 1;
    const controlsHeight = herdr ? (Number(this.screen.width) < 60 && !compact ? 2 : 1) : 0;
    this.status.bottom = height + 1 + selectorHeight + controlsHeight;
    this.transcript.bottom = height + 2 + selectorHeight + controlsHeight;
    this.transcript.top = compact ? 2 : 3;
    this.layoutButton.hidden = this.focusButton.hidden = !herdr;
    this.layoutButton.left = 1;
    this.layoutButton.bottom = height + 1 + controlsHeight - 1;
    this.layoutButton.width = compact ? 15 : 24;
    this.layoutButton.setContent(` ${compact ? '^O' : 'Ctrl+O'} ${ /** @type {Record<string, string>} */ ({ tab: 'Pestaña', right: 'Derecha →', down: 'Abajo ↓' })[layout]} `);
    this.focusButton.left = controlsHeight === 2 ? 1 : compact ? 16 : 26;
    this.focusButton.bottom = height + 1;
    this.focusButton.width = Math.max(1, Number(this.screen.width) - this.focusButton.left - 1);
    this.focusButton.setContent(` ${compact ? '^G' : 'Ctrl+G'} ${background ? (compact ? 'Quedarme' : 'Quedarme en Rutevi') : (compact ? 'Ir' : 'Ir a la tarea')} `);
    for (const button of [this.layoutButton, this.focusButton]) {
      button.style.fg = busy ? 'gray' : 'cyan';
      button.style.bg = 'default';
    }
    let left = 1;
    this.harnessButtons.forEach((button, index) => {
      const target = harnesses[index];
      const selected = target === harness;
      button.left = stacked ? 1 : left;
      button.bottom = height + 1 + controlsHeight + (stacked ? 2 - index : 0);
      button.width = shortLabels ? Math.floor((Number(this.screen.width) - 2) / 3) : harnessLabels[target].length + 8;
      button.setContent(shortLabels ? ` ${selected ? '●' : '○'} ${['Cdx', 'Open', 'Cl'][index]} ` : ` ${selected ? '●' : '○'} ${harnessLabels[target]} `);
      button.style.bg = selected && !busy ? 'cyan' : 'default';
      button.style.fg = selected && !busy ? 'black' : 'gray';
      button.style.bold = selected;
      left += Number(button.width);
    });
    this.header.setContent(`${tint('RUTEVI', '1;36')}  /  ${herdr ? 'HERDR' : 'LOCAL'}  ·  ${harnessLabels[harness]}\n${tint(this.cwd.length > Number(this.screen.width) - 3 ? '…' + this.cwd.slice(-(Number(this.screen.width) - 4)) : this.cwd, 90)}`);
    const icon = busy ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'][this.frame % 10] : '●';
    this.status.setContent(`${tint(icon + ' ' + phase, 36)}  ·  ${plainText(model)} ${plainText(effort)}`);
    const offset = this.transcript.getScroll();
    this.transcript.setContent(this.messages.map(message => `${tint(message.role, '1;' + (colors[message.role] ?? 90))}\n${message.text}`).join('\n\n'));
    if (this.follow) this.transcript.setScrollPerc(100);
    else this.transcript.setScroll(offset);
    this.input.setLabel(busy ? ' Borrador siguiente tarea ' : ` Nueva tarea → ${harnessLabels[harness]} `);
    this.input.style.border.fg = busy ? 'gray' : 'cyan';
    const parts = this.editor.parts;
    const prefix = parts.slice(0, this.editor.cursor).join('');
    const current = parts[this.editor.cursor] ?? ' ';
    const rest = parts.slice(this.editor.cursor + 1).join('');
    this.input.setContent(prefix + tint(current === '\n' ? ' ' : current, 7) + (current === '\n' ? '\n' : '') + rest + (!parts.length ? tint(Number(this.screen.width) < 60 ? ' Describe tu tarea…' : ' Describe la tarea. Jev elige el modelo y la abre…', 90) : ''));
    const width = Math.max(1, Number(this.input.width) - Number(this.input.iwidth));
    const row = prefix.split('\n').reduce((total, line) => total + Math.floor(blessedUnicode.strWidth(line) / width) + 1, -1);
    this.input.setScroll(Math.max(0, row - (height - 3)));
    this.footer.setContent(Number(this.screen.width) < 75 ? 'Tab destino · Enter abrir · /help' : 'Tab destino  ·  Enter abrir  ·  Ctrl+J salto  ·  ↑↓ historial  ·  PgUp/PgDn desplazar  ·  /help  ·  Esc salir');
    this.screen.render();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.spinner); clearTimeout(this.timer);
    this.screen.program.write('\x1b[?2004l');
    this.screen.destroy();
    this.terminalInput.close();
  }
}
