// Scoped to a single launched OpenCode process via OPENCODE_CONFIG_CONTENT.
// Apply the router's variant to the first task, without changing later manual choices.
/** @param {{client: Pick<import("../types.js").PluginClient, "tui">}} api */
export default async function JevLaunch({ client }) {
  const model = process.env.ROUTER_JEV_LAUNCH_MODEL;
  const variant = process.env.ROUTER_JEV_LAUNCH_VARIANT;
  let applied = false;
  return {
    /** @param {unknown} _input @param {import("../types.js").ChatOutput} output */
    'chat.message': async (_input, output) => {
      if (applied || !model) return;
      const separator = model.indexOf('/');
      if (separator < 1) throw new Error('Modelo de lanzamiento Jev inválido.');
      output.message.model = { providerID: model.slice(0, separator), modelID: model.slice(separator + 1), ...(variant ? { variant } : {}) };
      applied = true;
      try { await client.tui.showToast({ body: { title: 'Jev', message: `${model} / ${variant ?? 'default'}`, variant: 'info', duration: 5000 } }); } catch {}
    },
  };
}
