import { routeTask } from '../../../src/router.js';
try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 64000) throw new Error('Entrada supera 64 KB.');
  }
  const data = JSON.parse(input);
  if (typeof data.prompt !== 'string' || !data.prompt.trim() || (data.context !== undefined && typeof data.context !== 'string')) throw new Error('Se requiere JSON con prompt y context opcional.');
  console.log(JSON.stringify(await routeTask({ prompt: data.prompt, context: data.context }), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
