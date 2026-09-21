# Revisión de modelos — 2026-09-20

Ale pidió priorizar modelos fuertes y actuales, incluyendo Muse Spark 1.3.
La política OpenCode ahora usa `quality` por defecto: encaje con la tarea y
evidencia de capacidades antes que menor precio. `fast` y `balanced` siguen
disponibles. Las tareas triviales pueden usar un modelo ligero actual.

## Fuentes y decisión

| Modelo | Evidencia primaria consultada | Papel propuesto en el router |
|---|---|---|
| Muse Spark 1.3 | [Meta, 2 septiembre](https://research.meta.ai/blog/introducing-muse-spark-1-3): mejoras frente a 1.2 en programación prolongada, seguimiento de instrucciones y uso de herramientas | Trabajos largos con requisitos detallados y cambiantes |
| Kimi K3 | [Moonshot](https://www.kimi.ai/blog/kimi-k3): programación prolongada y combinación de código con inspección visual | Frontend, prototipos interactivos, iteración visual |
| Qwen3.8 Max | [Descripción oficial Qwen](https://chat.qwen.ai/legal-agreement/models): flagship para lógica, matemática y programación; contexto de 1M | Razonamiento matemático/algorítmico difícil |
| MiniMax M3 | [Reporte oficial](https://www.minimax.io/blog/minimax-m3): resultados de programación/agentes con metodología y contexto largo | Automatización sostenida con muchas herramientas, especialmente coste equilibrado |
| Gemini 3.8 Flash | [Google, 2 septiembre](https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/): mejora sobre 3.7 en ingeniería y razonamiento de varios pasos | Investigación con muchos documentos combinada con implementación |
| Claude Fable 5.1 | [Anthropic](https://www.anthropic.com/claude/fable): modelo de septiembre para proyectos complejos y largos | Candidato premium, desactivado por fallo de acceso |
| Claude Sonnet 5 | [Anthropic](https://www.anthropic.com/news/claude-sonnet-5): mejoras de coding/tool use sobre 4.6 | Considerado; no activado por fallo de acceso |

Los roles son decisiones de integración, **no hechos de superioridad universal**.
Las afirmaciones de capacidades proceden de fabricantes; no se combinaron sus
benchmarks en una tabla de puntuaciones porque usan tareas, esfuerzos y harnesses
distintos. No se afirma que el más reciente sea siempre el mejor.

## Acceso y pruebas reales

OpenCode 1.18.31, mismas conexiones de la cuenta; sin cambios de permisos,
facturación, región ni consentimiento. Se envió un caso sintético de normalización
de etiquetas y se comprobó la salida JSON y finalización. Eso verifica acceso y
un contrato pequeño, **no calidad de coding autónomo**.

| Modelo servido | Resultado | Variante de la prueba |
|---|---|---|
| `opencode/muse-spark-1.3` | Correcto | low |
| `opencode-go/qwen3.8-max` | Correcto | low |
| `opencode-go/minimax-m3` | Correcto | none |
| `opencode-go/kimi-k3` | Correcto | max |
| `opencode/gemini-3.8-flash` | Correcto | low |
| `opencode/claude-fable-5-1` | HTTP 401 | low |
| `opencode/claude-sonnet-5` | HTTP 401 | low |
| `openai/gpt-6-astra` | HTTP 400: modelo no soportado por ese endpoint con la cuenta ChatGPT | low |
| `opencode/gpt-6-astra` | Correcto; seleccionado para Astra en OpenCode | low |

Resultados sanitizados y fechas en `artifacts/model-probes.json`. Las variantes
de la política pueden usar más razonamiento que estos probes; se validan contra
el catálogo. El smoke adicional Spark recorre Jev → Spark con variante `high`.

Se conserva el bloqueo previo de DeepSeek por opt-in regional. El pool activo
queda en nueve: cinco nuevos más GLM 5.3 Flash, GLM 5.3, GPT Luna y GPT Astra.
No se vuelve a intentar una tarea automáticamente con otro proveedor.
La comprobación adicional durante la integración de sesiones excluyó Astra vía
OpenAI OAuth: la política usa únicamente Zen para ese candidato y consume su
saldo. Esto no cambia Codex nativo, donde Astra sí pasó la prueba de sesión.

## Spark estándar y Contributor

Se añadió **Spark 1.3 estándar de Zen**. No se lo sustituyó por Go Contributor ni
por la variante gratuita: [OpenCode documenta](https://opencode.ai/docs/go/#privacy)
que Contributor usa prompts y completions para entrenamiento. Precio y política
de datos forman parte de la elección del endpoint, no solo el nombre del modelo.

## Actualización futura

`opencode-policy.json` conserva `reviewedAt`, evidencia y fuentes. El router
consulta el catálogo local y pasa fecha de lanzamiento, evidencia resumida,
contexto y costes a Jev. No instala revisiones nuevas por simple coincidencia
de nombre: primero se revisan fuentes, variantes y acceso.

```sh
router-jev models --harness opencode
npm run probe:models -- opencode/muse-spark-1.3
npm run eval:opencode
```

Los probes usan cuota real y guardan solo resultados sanitizados. La revisión
es manual, no una automatización periódica ni garantía de actualidad futura.
