import assert from 'node:assert/strict';
import { loadOpenCodeCatalog, loadPolicy, routeOpenCode } from '../src/opencode.js';

const catalog = await loadOpenCodeCatalog(process.cwd());
const policy = await loadPolicy();
const enabled = key => policy.candidates.some(item => item.key === key && item.enabled !== false);
const cases = [
  { name: 'mechanical', prompt: 'Corrige únicamente el typo "Sing in" por "Sign in" en una línea JavaScript.', expected: ['glm_flash'] },
  { name: 'sql', prompt: 'Escribe una consulta SQL con ROW_NUMBER para elegir el pedido más reciente de cada cliente, explica el desempate por id.', expected: enabled('deepseek_flash') ? ['deepseek_flash', 'qwen_max'] : ['glm_flash', 'gpt_coding', 'qwen_max'] },
  { name: 'implementation', prompt: 'Añade paginación al listado React existente y tests para siguiente y anterior usando el endpoint actual.', expected: ['gpt_coding', 'muse_spark', 'kimi'] },
  { name: 'architecture', prompt: 'Diseña una migración sin downtime de pagos a microservicios, comparando idempotencia, consistencia y rollback.', expected: ['gpt_reasoning'] },
  { name: 'deep proof', prompt: 'Demuestra formalmente la corrección y terminación de un algoritmo distribuido de consenso bajo fallos bizantinos y analiza los límites del modelo asíncrono.', expected: enabled('deepseek_pro') ? ['deepseek_pro', 'gpt_reasoning', 'qwen_max'] : ['gpt_reasoning', 'qwen_max'] },
  { name: 'missing context', prompt: 'Hazlo.', expected: ['gpt_reasoning'] },
  { name: 'follow-up', prompt: 'Hazlo.', context: 'Reemplazar solamente "Sing in" por "Sign in" en una línea.', expected: ['glm_flash'] },
  { name: 'spark explicit family', prompt: 'Usa Muse Spark 1.3 para implementar este flujo con múltiples pasos y requisitos.', expected: ['muse_spark'] },
  { name: 'long evolving constraints', prompt: 'Implementa un flujo largo con cambios de requisitos mientras avanzamos. Conserva las 40 restricciones detalladas y coordina los varios flujos de trabajo en este hilo sin perder lo decidido.', expected: ['muse_spark'] },
  { name: 'visual frontend', prompt: 'Construye un prototipo web ambicioso e interactivo; alterna código y capturas para pulir layout, animaciones, responsive y estados visuales.', expected: ['kimi'] },
  { name: 'automation', preference: 'balanced', prompt: 'Automatiza un flujo largo de cientos de pasos repetitivos de terminal y herramientas, con gran contexto. Busco ejecución sostenida con coste equilibrado; no es arquitectura difícil.', expected: ['minimax'] },
  { name: 'research and engineering', prompt: 'Sintetiza muchos documentos técnicos largos y fuentes contradictorias, luego implementa un prototipo que contraste las conclusiones. Es una tarea mixta de investigación y análisis de ingeniería de varios pasos.', expected: ['gemini', 'muse_spark', 'kimi'] },
];
let failures = 0;
for (const { name, expected, ...input } of cases) {
  const result = await routeOpenCode(input, catalog, policy);
  const passed = ['jev', 'no-fit-fallback'].includes(result.source) && expected.includes(result.policyRole);
  if (!passed) failures++;
  console.log(JSON.stringify({ name, expected, passed, ...result }));
}
assert.equal(failures, 0, `${failures} routing policy cases failed`);
