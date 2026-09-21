import { createInterface } from 'node:readline';
import { createDirectCodex } from './direct-codex.js';

/** @param {import('./types.js').Options} options */
export async function runDirectSession(options) {
  const session = createDirectCodex(options);
  const lines = createInterface({input:process.stdin,crlfDelay:Infinity});
  const iterator = lines[Symbol.asyncIterator]();
  const json = options.json === true;
  /** @param {Record<string, unknown>} event */
  const emit = event => {
    if (json) console.log(JSON.stringify(event));
    else if (event.type === 'text') process.stdout.write(String(event.text));
    else if (event.type === 'route') {
      const assignments = /** @type {{status: string, candidate?: {model?: string, effort?: string}|null}[]} */ (event.assignments);
      const decision = assignments[0];
      console.error(`[jev] ${decision?.candidate?.model ?? decision?.status} / ${decision?.candidate?.effort ?? '—'} · ${event.latencyMs} ms`);
    } else if (event.type === 'result') console.error(`[${event.status}] hilo ${event.threadId}`);
    else console.error(`Jev directo · hilo ${event.threadId} · ${event.candidateCount} candidatos`);
  };
  const onInterrupt = () => { session.close(); lines.close(); process.exitCode = 130; };
  process.once('SIGINT',onInterrupt);
  try {
    const ready = await session.initialize();
    emit({type:'ready',threadId:ready.threadId,candidateCount:ready.candidates.length});
    /** @param {string} prompt */
    const send = async prompt => {
      const result = await session.send(prompt,emit);
      if (!json) process.stdout.write('\n');
      emit({type:'result',...result});
      if (result.status !== 'completed') process.exitCode = 1;
    };
    if (options.prompt) await send(options.prompt);
    else {
      if (!json && process.stdin.isTTY) console.error('Escribe una tarea por línea. /quit para salir. Jev enruta antes de cada turno.');
      for await (const line of iterator) {
        if (line.trim() === '/quit') break;
        if (!line.trim()) continue;
        let prompt = line;
        if (json) {
          let request;
          try { request = JSON.parse(line); } catch { throw new Error('Expected one JSON object per line: {"prompt":"..."}'); }
          if (!request || typeof request.prompt !== 'string') throw new Error('prompt must be text.');
          prompt = request.prompt;
        }
        await send(prompt);
      }
    }
  } finally { process.off('SIGINT',onInterrupt); lines.close(); session.close(); }
}
