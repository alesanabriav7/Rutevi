/** @param {import("./types.js").Options} options @param {import("./types.js").Route} route */
export function codexArgs({ command, prompt, context, cwd, sandbox, json, ephemeral }, route) {
  const args = [];
  if (command === 'run') args.push('exec', '--skip-git-repo-check');
  args.push('-m', route.model, '-c', `model_reasoning_effort=${JSON.stringify(route.effort)}`, '-C', cwd);
  if (sandbox) args.push('-s', sandbox);
  if (json) args.push('--json');
  if (ephemeral) args.push('--ephemeral');
  let input = prompt ?? '';
  if (context) input = `Contexto proporcionado por el usuario:\n${context}\n\nPetición:\n${prompt}`;
  // Argument array, no shell interpolation; -- protects leading-dash prompts.
  args.push('--', input);
  return args;
}
