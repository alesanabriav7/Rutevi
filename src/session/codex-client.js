import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export class CodexClient extends EventEmitter {
  /** @param {{cwd: string, request?: (method: string, params: import("../types.js").RpcParams|undefined) => Promise<unknown>, executable?: string, args?: string[]}} options */
  constructor({ cwd, request = async () => { throw new Error('No interactive request handler'); }, executable = 'codex', args = ['app-server', '--stdio'] }) {
    super();
    /** @type {Map<number, {resolve: (value: unknown) => void, reject: (error: unknown) => void, timer: NodeJS.Timeout}>} */
    this.pending = new Map();
    /** @type {unknown} */
    this.failed = undefined;
    /** @type {{threadId: string, turnId: string|null}|null} */
    this.active = null;
    this.sequence = 0;
    this.request = request;
    const env = { ...process.env };
    delete env.TYPESAFE_API_KEY;
    this.child = spawn(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      try { this.receive(JSON.parse(line)); }
      catch { this.fail(new Error('Respuesta inválida de Codex App Server.')); }
    });
    // Do not expose raw diagnostics which can include provider configuration.
    this.child.stderr.resume();
    this.child.on('error', () => this.fail(new Error('No se pudo iniciar Codex App Server.')));
    this.child.on('exit', () => this.fail(new Error('Codex App Server terminó.')));
    this.child.stdin.on('error', () => this.fail(new Error('Se cerró la conexión con Codex.')));
  }

  /** @param {unknown} message */
  send(message) { this.child.stdin.write(JSON.stringify(message) + '\n'); }

  /** @param {string} method @param {Record<string, unknown>} params @returns {Promise<unknown>} */
  call(method, params, timeout = 30000) {
    if (this.failed) return Promise.reject(this.failed);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tiempo agotado: ${method}. No se reintentó la petición.`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  /** @param {import("../types.js").RpcMessage} message */
  receive(message) {
    if (message.method && message.id !== undefined) {
      Promise.resolve().then(() => this.request(message.method ?? '', message.params)).then(
        result => this.send({ id: message.id, result }),
        () => this.send({ id: message.id, error: { code: -32601, message: 'Solicitud no soportada por router-jev; no se autorizó.' } }),
      );
    } else if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`Codex rechazó la solicitud (${message.error.code}).`));
      else pending.resolve(message.result);
    } else if (message.method) this.emit('notification', message);
  }

  /** @param {unknown} error */
  fail(error) {
    this.failed = error;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.emit('closed', error);
  }

  async initialize() {
    await this.call('initialize', { clientInfo: { name: 'router_jev', title: 'Router Jev', version: '0.4.0' } });
    this.send({ method: 'initialized', params: {} });
  }

  /** @param {{threadId: string, [key: string]: unknown}} params @param {(event: import("../types.js").RpcMessage) => void} onEvent */
  async turn(params, onEvent = () => {}) {
    if (this.active) throw new Error('Ya hay un turno activo.');
    /** @type {(turn: import("../types.js").RpcTurn) => void} */
    let resolveDone = () => {};
    /** @type {(error: unknown) => void} */
    let rejectDone = () => {};
    /** @type {Promise<import("../types.js").RpcTurn>} */
    const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
    // Prevent an unhandled rejection if the process closes during turn/start.
    done.catch(() => {});
    /** @type {{threadId: string, turnId: string|null}} */
    const active = { threadId: params.threadId, turnId: null };
    this.active = active;
    /** @param {unknown} error */
    const onClosed = error => rejectDone(error);
    /** @param {import("../types.js").RpcMessage} event */
    const onNotification = event => {
      if (event.params?.threadId !== params.threadId) return;
      if (event.method === 'turn/started' && event.params.turn) active.turnId = event.params.turn.id;
      onEvent(event);
      if (event.method === 'turn/completed' && event.params.turn) resolveDone(event.params.turn);
    };
    this.on('notification', onNotification);
    this.on('closed', onClosed);
    try {
      const result = await this.call('turn/start', params);
      if (!result || typeof result !== 'object' || !('turn' in result) || !result.turn || typeof result.turn !== 'object' || !('id' in result.turn) || typeof result.turn.id !== 'string') throw new Error('Respuesta inválida al iniciar turno.');
      active.turnId = result.turn.id;
      return await done;
    } catch (error) {
      // A timed-out start may already be executing. Close this owned server so a
      // subsequent input cannot accidentally overlap or duplicate that work.
      this.fail(error);
      this.close();
      throw error;
    } finally {
      this.off('notification', onNotification);
      this.off('closed', onClosed);
      this.active = null;
    }
  }

  async interrupt() {
    if (this.active?.turnId) await this.call('turn/interrupt', this.active);
  }

  close() {
    this.lines.close();
    this.child.stdin.end();
    this.child.kill('SIGTERM');
  }
}
