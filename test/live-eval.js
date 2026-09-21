import assert from 'node:assert/strict';
import { routeTask } from '../src/router.js';

// Synthetic inputs only. Makes real TypeSafe requests; never launches Codex.
const cases = [
  { name: 'arithmetic', prompt: 'Responde cuánto es 17 por 23.', expected: 'simple' },
  { name: 'mechanical edit', prompt: 'Reemplaza el texto exacto "Sing in" por "Sign in" en login.html, sin otros cambios.', expected: 'simple' },
  { name: 'bounded implementation', prompt: 'Añade paginación al listado existente de productos en React, usando el endpoint actual y cubriendo siguiente y anterior con tests.', expected: 'standard' },
  { name: 'architecture', prompt: 'Diseña la migración sin downtime de un monolito de pagos a servicios, con idempotencia, rollback y consistencia entre bases de datos; compara los tradeoffs.', expected: 'complex' },
  { name: 'hard diagnosis', prompt: 'Diagnostica una carrera intermitente entre tres servicios que duplica pagos; dos intentos previos de corrección fallaron y no sabemos la causa.', expected: 'complex' },
  { name: 'missing context', prompt: 'Hazlo.', expected: 'unclear' },
  { name: 'follow-up with context', prompt: 'Hazlo.', context: 'El usuario aprobó reemplazar el typo exacto "Sing in" por "Sign in" en login.html. No hay otros cambios.', expected: 'simple' },
];

let failures = 0;
for (const { name, expected, ...input } of cases) {
  const result = await routeTask(input);
  const passed = result.source === 'jev' && result.category === expected;
  if (!passed) failures++;
  console.log(JSON.stringify({ name, expected, passed, ...result }));
}
assert.equal(failures, 0, `${failures} live routing cases failed`);
