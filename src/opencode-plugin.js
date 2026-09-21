import { loadPolicy, routeOpenCode } from './opencode.js';
import { routingContext } from './session/commands.js';

const marker = '[router-jev-command] ';

/** @param {{id: string, models?: Record<string, import("./types.js").ProviderModel>}[]} providers */
export function providerCatalog(providers) {
  return providers.flatMap(provider => Object.entries(provider.models ?? {}).map(([id, model]) => ({
    id: `${provider.id}/${id}`, name: model.name, status: model.status,
    releaseDate: model.release_date, toolcall: model.capabilities?.toolcall ?? model.tool_call ?? false,
    context: model.limit?.context, inputCost: model.cost?.input, outputCost: model.cost?.output,
    variants: Object.keys(model.variants ?? {}).filter(key => !model.variants?.[key]?.disabled),
  })));
}

/** @param {{client: import("./types.js").PluginClient}} api */
export async function createJevPlugin({ client }, { select = routeOpenCode, policyLoader = loadPolicy } = {}) {
  /** @type {Map<string, {automatic: boolean, last: {model: string, variant?: string, source: string}|null}>} */
  const sessions = new Map();
  /** @param {string} id */
  const getState = id => {
    const state = sessions.get(id) ?? { automatic: false, last: null };
    sessions.set(id, state);
    return state;
  };
  /** @param {string} message */
  const notice = async message => {
    try { await client.tui.showToast({ body: { title: 'Jev', message, variant: 'info', duration: 5000 } }); }
    catch { /* A headless client may not have a TUI. */ }
  };
  return {
    /** @param {{command?: Record<string, {description: string, template: string, subtask: boolean}>}} config */
    config: async config => {
      config.command ??= {};
      if (config.command.jev) throw new Error('Ya existe /jev en OpenCode; router-jev no lo sobrescribe.');
      // Never interpolate arguments in the command template: OpenCode expands shell
      // expressions in templates. We insert literal task data later in the hook.
      config.command.jev = { description: 'Jev: tarea | auto | off | status', template: 'Router Jev', subtask: false };
    },
    /** @param {{command: string, arguments: string}} input @param {import("./types.js").ChatOutput} output */
    'command.execute.before': async (input, output) => {
      if (input.command !== 'jev') return;
      output.parts.splice(0, output.parts.length, { type: 'text', text: marker + input.arguments.trim() });
    },
    /** @param {{sessionID: string}} input @param {import("./types.js").ChatOutput} output */
    'chat.message': async (input, output) => {
      const texts = output.parts.filter(part => part.type === 'text' && !part.synthetic && !part.ignored);
      const commandPart = texts.find(part => part.text.startsWith(marker));
      const state = getState(input.sessionID);
      const command = commandPart?.text.slice(marker.length).trim() ?? '';
      if (commandPart && ['', 'auto', 'off', 'status'].includes(command)) {
        if (command === 'auto') state.automatic = true;
        if (command === 'off') state.automatic = false;
        const status = `Jev automático: ${state.automatic ? 'on' : 'off'}. ${state.last ? `Última selección: ${state.last.model} / ${state.last.variant ?? 'default'}.` : 'Sin selección aún.'}`;
        commandPart.text = `Responde únicamente este estado, sin herramientas ni otras acciones: ${status}`;
        await notice(status);
        return;
      }
      if (!commandPart && !state.automatic) return;
      if (!texts.length) return;
      const prompt = commandPart ? command : texts.map(part => part.text).join('\n');
      if (!prompt || Buffer.byteLength(prompt) > 48000) throw new Error('Jev requiere una petición de texto de hasta 48 KB.');
      // Refuse rather than silently routing multimodal tasks using text-only evidence.
      if (output.parts.some(part => part.type === 'file')) throw new Error('Jev en sesión admite texto. Usa /jev off para enviar adjuntos con el modelo que elijas.');
      const [providers, messages, policy] = await Promise.all([
        client.config.providers({}),
        client.session.messages({ path: { id: input.sessionID }, query: { limit: 8 } }),
        policyLoader(),
      ]);
      if (providers.error || !providers.data?.providers || messages.error || !Array.isArray(messages.data)) throw new Error('Jev no pudo leer catálogo/contexto; no se ejecutó esta petición.');
      const history = messages.data.filter(item => item.info.id !== output.message.id)
        .filter(item => item.info.role === 'user' || item.info.role === 'assistant')
        .map(item => ({ role: item.info.role, text: item.parts.filter(part => part.type === 'text' && !part.synthetic && !part.ignored).map(part => part.text).join('\n') }));
      const decision = await select({ prompt, context: routingContext(history) }, providerCatalog(providers.data.providers), policy);
      const separator = decision.model.indexOf('/');
      if (separator < 1) throw new Error('Jev devolvió un modelo inválido.');
      // 1.18.31 persists variant inside User.model, despite older SDK v1 types.
      output.message.model = { providerID: decision.model.slice(0, separator), modelID: decision.model.slice(separator + 1), variant: decision.variant };
      if (commandPart) commandPart.text = prompt;
      state.last = { model: decision.model, variant: decision.variant, source: decision.source };
      try { await client.app.log({ body: { service: 'router-jev', level: 'info', message: 'routing', extra: { ...state.last, errorType: decision.errorType, candidateCount: decision.candidateCount } } }); } catch {}
      await notice(`${decision.model} / ${decision.variant ?? 'default'} (${decision.source})`);
    },
    /** @param {{event: {type: string, properties: {info: {id: string}}}}} event */
    event: async ({ event }) => {
      if (event.type === 'session.deleted') sessions.delete(event.properties.info.id);
    },
    dispose: async () => sessions.clear(),
  };
}
