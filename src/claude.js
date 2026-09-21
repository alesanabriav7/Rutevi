import { routeTask } from './router.js';

// Native aliases follow the user's provider configuration. Access is enforced by Claude Code.
const claudeRoutes = {
  simple: { model: 'sonnet', effort: 'low' },
  standard: { model: 'sonnet', effort: 'medium' },
  complex: { model: 'fable', effort: 'high' },
  unclear: { model: 'fable', effort: 'high' },
};

/** @param {import("./types.js").RoutingOptions} options @param {import("./types.js").RoutingClient} [client] */
export async function routeClaude(options, client) {
  return { ...await routeTask(options, client, claudeRoutes), harness: 'claude' };
}

/** @param {import("./types.js").Options} options @param {import("./types.js").Route} route */
export function claudeArgs({ command, prompt, context, session, json }, route) {
  const args = ['--model', route.model, '--effort', route.effort ?? 'medium'];
  if (command === 'run') args.push('--print');
  if (json) args.push('--output-format', 'stream-json', '--verbose');
  if (session) args.push('--resume', session);
  const input = context ? `Contexto proporcionado por el usuario:\n${context}\n\nPetición:\n${prompt}` : prompt ?? '';
  args.push('--', input);
  return args;
}
