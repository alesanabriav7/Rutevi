---
name: jev
description: Enruta una tarea con Jev y la abre en una pestaña nueva de Herdr con Codex, OpenCode o Claude y el modelo elegido. Úsala cuando Ale invoque Jev para lanzar o enrutar trabajo; también permite consultar solo una recomendación si eso pide.
---

# Jev: elegir modelo y abrir la tarea

`$jev <tarea>` significa elegir y lanzar la tarea, no detenerse en una recomendación.
Interpreta la tarea con el contexto reciente. Si no hay objetivo recuperable, pregunta cuál lanzar.
Respeta el harness solicitado; por defecto usa Codex. No hace falta escribir `/jev` dentro de la TUI de Jev.

Para lanzar, ejecuta `node <directorio-de-esta-skill>/dispatch.mjs` enviando por stdin
JSON con `prompt`, `context` (resumen relevante), `cwd` y opcionalmente
`harness: "codex" | "opencode" | "claude"`. Usa heredoc con delimitador entre comillas o API
de procesos; no interpoles la petición en shell. No incluyas credenciales ni datos
privados ajenos a la tarea. El helper consulta Jev y abre el harness con la tarea,
modelo y esfuerzo/variante seleccionados en el workspace del pane que lo invoca.

Requiere `HERDR_ENV=1`. Fuera de Herdr, explica ese límite e indica
`router-jev session` desde una terminal de Herdr; no controles una sesión enfocada
ajena ni arranques una TUI interactiva anidada desde una herramienta del agente.

Informa modelo, esfuerzo/variante, origen (incluido fallback) y tab/pane devueltos.
Una pestaña abierta no significa tarea completada. No repitas automáticamente un
lanzamiento fallido o incierto: inspecciona los IDs devueltos primero.
El modelo cambia en la sesión nueva; no afirmes haber cambiado el agente actual.

Si Ale pide explícitamente **solo recomendar/evaluar**, ejecuta `recommend.mjs`
con JSON `prompt` y `context`, e informa la decisión sin lanzar nada.

Uso humano: `router-jev session` abre una TUI con barra fija y tareas arriba.
Escribir una tarea y Enter basta; Tab alterna Codex/OpenCode/Claude. Cada tarea abre su
pestaña. `router-jev session --harness opencode "tarea"` lanza directamente.
