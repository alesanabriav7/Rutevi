import { readFile } from 'node:fs/promises';
import { assignTasks } from './assign.js';

/** @param {import("./types.js").RoutingOptions} options @param {import("./types.js").RoutingClient} [client] @returns {Promise<import('./types.js').Route>} */
export async function routeClaude(options, client) {
  if (options.model) {
    if (options.model.includes('haiku') && options.effort) throw new Error('Haiku no admite effort.');
    return { model:options.model, ...(options.effort ? {effort:options.effort} : {}),source:'explicit',harness:'claude',latencyMs:0 };
  }
  const policy = JSON.parse(await readFile(new URL('../claude-policy.json',import.meta.url),'utf8'));
  const result = await assignTasks({context:options.context ?? '',tasks:[{id:'task',prompt:options.prompt,
    priority:options.preference === 'fast' ? 'speed' : options.preference ?? 'balanced',
    candidates:policy.candidates.filter(/** @param {{model: string}} c */ c => !options.effort || c.model !== 'haiku')
      .map(/** @param {Record<string, unknown>} c */ c => ({...c,kind:'external',harness:'claude',...(options.effort ? {effort:options.effort} : {})}))}]},client);
  const decision = result.assignments[0];
  if (result.source !== 'jev' || decision?.status !== 'selected' || !decision.candidate) throw new Error(`Jev no seleccionó un ejecutor Claude (${decision?.status ?? result.source}).`);
  return { model:decision.candidate.model ?? '',effort:decision.candidate.effort,harness:'claude',source:'jev',
    confidence:decision.confidence,jevModel:result.jevModel,latencyMs:result.latencyMs,usage:result.usage,assignment:decision };
}

/** @param {import("./types.js").Options} options @param {import("./types.js").Route} route */
export function claudeArgs({ command, prompt, context, session, json }, route) {
  const args = ['--model', route.model];
  if (!route.model.includes('haiku')) args.push('--effort', route.effort ?? 'medium');
  if (command === 'run') args.push('--print');
  if (json) args.push('--output-format', 'stream-json', '--verbose');
  if (session) args.push('--resume', session);
  const input = context ? `Contexto proporcionado por el usuario:\n${context}\n\nPetición:\n${prompt}` : prompt ?? '';
  args.push('--', input);
  return args;
}
