/** @param {string} line */
export function parseSessionInput(line, automatic = false) {
  const input = line.trim();
  if (!input) return { type: 'empty' };
  if (input === '/quit' || input === '/exit') return { type: 'quit' };
  if (input === '/help') return { type: 'help' };
  if (input === '/jev' || input === '/jev status') return { type: 'status' };
  if (input === '/jev auto') return { type: 'mode', automatic: true };
  if (input === '/jev off') return { type: 'mode', automatic: false };
  if (input.startsWith('/jev ')) return { type: 'task', prompt: input.slice(5).trim(), route: true };
  if (input.startsWith('/')) throw new Error('Comando desconocido. Usa /help.');
  return { type: 'task', prompt: input, route: automatic };
}

/** @param {{role: string, text: string}[]} messages */
export function routingContext(messages) {
  // Text only: no files, tool results, hidden reasoning or transcript paths.
  return messages.slice(-8).map(({ role, text }) => `${role}: ${text.slice(-2000)}`).join('\n').slice(-12000);
}
