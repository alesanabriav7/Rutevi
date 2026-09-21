import { readFile } from 'node:fs/promises';
import { assignTasks } from './assign.js';
import { CodexClient } from './session/codex-client.js';
import { routingContext } from './session/commands.js';

/** @typedef {{id: string, model: string, effort: string, costRank: number, latencyRank?: number, description: string}} DirectCandidate */
/** @param {unknown} models @param {unknown} policy @returns {DirectCandidate[]} */
export function directCandidates(models, policy) {
  if (!Array.isArray(models) || !policy || typeof policy !== 'object' || !('candidates' in policy) || !Array.isArray(policy.candidates)) throw new Error('Invalid direct routing inventory.');
  if (!policy.candidates.length || policy.candidates.length > 16) throw new Error('Direct policy requires 1–16 candidates.');
  const ids = new Set();
  return policy.candidates.flatMap(entry => {
    if (!entry || typeof entry !== 'object' || ['id','model','effort','description'].some(key => typeof entry[key] !== 'string' || !entry[key].trim())
      || typeof entry.costRank !== 'number' || !Number.isFinite(entry.costRank) || entry.costRank < 0 || ids.has(entry.id)) throw new Error('Invalid direct policy candidate.');
    if (entry.latencyRank !== undefined && (typeof entry.latencyRank !== 'number' || !Number.isFinite(entry.latencyRank) || entry.latencyRank < 0)) throw new Error('Invalid latency rank.');
    ids.add(entry.id);
    const available = models.some(m => m?.model === entry.model && m.hidden !== true
      && Array.isArray(m.supportedReasoningEfforts) && m.supportedReasoningEfforts.some(/** @param {{reasoningEffort?: string}} e */ e => e.reasoningEffort === entry.effort));
    return available ? [{id:entry.id,model:entry.model,effort:entry.effort,costRank:entry.costRank,...(entry.latencyRank !== undefined ? {latencyRank:entry.latencyRank} : {}),description:entry.description}] : [];
  });
}

/** A transport-owned conversation. No generative model prepares routing inputs.
 * @param {import('./types.js').Options} options */
export function createDirectCodex(options, { client = new CodexClient({cwd: options.cwd}), assign = assignTasks,
  load = async () => JSON.parse(await readFile(new URL('../codex-direct-policy.json', import.meta.url), 'utf8')) } = {}) {
  /** @type {DirectCandidate[]} */
  let candidates = [];
  /** @type {{role: string, text: string}[]} */
  const history = [];
  let threadId = '';
  let busy = false;
  let closed = false;
  let initialized = false;
  return {
    async initialize() {
      if (initialized || closed) throw new Error('Direct session already initialized or closed.');
      await client.initialize();
      /** @type {unknown[]} */
      const models = [];
      let cursor;
      do {
        const result = /** @type {{data: unknown[], nextCursor?: string|null}} */ (await client.call('model/list', {includeHidden:false, ...(cursor ? {cursor} : {})}));
        if (!Array.isArray(result.data) || models.length > 1000) throw new Error('Invalid model catalog.');
        models.push(...result.data); cursor = result.nextCursor;
      } while (cursor);
      candidates = directCandidates(models, await load());
      if (!candidates.length) throw new Error('No supported model/effort from direct policy is available.');
      // Thread creation/resume is metadata only; inference starts exclusively in send().
      const result = /** @type {{thread: {id: string, turns?: {items?: {type: string, content?: {type: string, text?: string}[], text?: string}[]}[]}}} */ (await client.call(options.session ? 'thread/resume' : 'thread/start', {
        ...(options.session ? {threadId:options.session} : {}), cwd:options.cwd,
        ...(options.sandbox ? {sandbox:options.sandbox} : {}),
      }));
      if (typeof result.thread?.id !== 'string') throw new Error('Invalid Codex thread.');
      threadId = result.thread.id;
      for (const turn of (result.thread.turns ?? []).slice(-8)) for (const item of turn.items ?? []) {
        if (item.type === 'userMessage') history.push({role:'user',text:(item.content ?? []).filter(c=>c.type==='text').map(c=>c.text ?? '').join('\n')});
        if (item.type === 'agentMessage' && typeof item.text === 'string') history.push({role:'assistant',text:item.text});
      }
      initialized = true;
      return {threadId,candidates};
    },
    /** @param {string} prompt @param {(event: Record<string, unknown>) => void} [emit] */
    async send(prompt, emit = () => {}) {
      if (!initialized || closed || busy) throw new Error('Direct session unavailable or busy.');
      if (!prompt.trim() || Buffer.byteLength(prompt) > 48000) throw new Error('Direct prompt requires 1–48 KB of text.');
      busy = true;
      try {
        const result = await assign({context:routingContext(history),tasks:[{id:'turn',prompt,priority:options.preference === 'fast' ? 'speed' : options.preference ?? 'balanced',
          candidates:candidates.map(c=>({...c,kind:'external',harness:'codex'}))}]});
        if (closed) throw new Error('Direct session closed during routing.');
        const decision = result.assignments[0];
        emit({type:'route',...result});
        if (result.source !== 'jev' || decision?.status !== 'selected' || !decision.candidate) {
          return {threadId,status:'not-executed',routing:result};
        }
        const selected = candidates.find(c=>c.id === decision.candidate?.id);
        if (!selected || selected.model !== decision.candidate.model || selected.effort !== decision.candidate.effort) throw new Error('Unrecognized direct route.');
        let answer = '';
        let usage;
        const turn = await client.turn({threadId,model:selected.model,effort:selected.effort,input:[{type:'text',text:prompt}]}, event => {
          if (event.method === 'item/agentMessage/delta' && typeof event.params?.delta === 'string') {
            answer += event.params.delta; emit({type:'text',text:event.params.delta});
          }
          if (event.method === 'thread/tokenUsage/updated') usage = event.params?.tokenUsage;
        });
        history.push({role:'user',text:prompt},{role:'assistant',text:`[${turn.status}] ${answer}`});
        history.splice(0,Math.max(0,history.length-8));
        return {threadId,status:turn.status,model:selected.model,effort:selected.effort,answer,usage,routing:result};
      } finally { busy = false; }
    },
    async interrupt() { await client.interrupt(); },
    close() { closed = true; client.close(); },
  };
}
