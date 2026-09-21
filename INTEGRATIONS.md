# Rutevi: routing en conversación y sesiones separadas

Desde 0.8.0 la integración principal usa una skill compartida para seleccionar
ejecutores y recoger los resultados en la conversación. La TUI sigue abriendo
sesiones separadas con modelo elegido por Jev. No hay que escribir `/jev` en la TUI.

## TUI interactiva

```sh
rutevi
rutevi --harness opencode
rutevi --harness claude
```

Dentro de Herdr abre una pestaña **Rutevi** en el workspace de la terminal
que invoca el comando. Fuera de Herdr usa la terminal actual. `--inline` evita
crear la pestaña del router, por ejemplo si ya tienes una terminal dedicada.

La TUI tiene historial de tareas arriba, estado de routing y barra fija abajo:

- Escribe una tarea y **Enter**: elige modelo/esfuerzo y abre la tarea.
- **Selector visible sobre la entrada:** clic o **F1 Codex / F2 OpenCode / F3 Claude**.
  La opción elegida queda resaltada y también aparece en el título de la entrada.
  Cambiarla conserva el borrador; **Tab** permite alternar. Si hay opciones específicas (`--model`,
  `--session`, `--sandbox`, etc.), el harness queda fijado para no trasladarlas
  al ejecutor equivocado.
- **Ctrl+J / Alt+Enter** añade una línea. El pegado multilínea no envía la tarea.
- **↑ / ↓** recupera tareas; **← / →**, Home/End y Backspace editan el texto.
- **PgUp/PgDn / rueda** desplaza el historial; el borrador permanece abajo.
- `/status`, `/help`, `/quit`; **Ctrl+C/Esc** cancela el routing pendiente o sale
  cuando está en reposo. Una apertura ya enviada no se reintenta ni se duplica.

Cada tarea se abre en una pestaña nativa nueva y recibe foco. Vuelve a la pestaña
Jev para lanzar otra. Codex, OpenCode y Claude usan sus TUIs nativas. Un adaptador de
OpenCode aplica modelo/variante a la primera petición mediante configuración
solo de ese proceso; no cambia preferencias globales ni decisiones manuales posteriores.
Las aprobaciones, herramientas y conversación posterior pertenecen al harness.
No se envía a Jev el historial de tareas independientes.

Fuera de Herdr, Jev entrega la terminal al harness tras elegir el modelo.
No intenta controlar una sesión Herdr enfocada desde fuera de su entorno.

## Lanzar una tarea directamente

```sh
rutevi session "Implementa paginación y añade tests"
rutevi session --harness opencode "Mejora el diseño de esta pantalla"
rutevi session --harness claude "Implementa esta mejora"
rutevi session --cwd /ruta/proyecto --sandbox read-only "Explica el repositorio"
rutevi session --session ID "Continúa el trabajo con esta corrección"
```

Con tarea, abre directamente el harness seleccionado en Herdr; no crea una
consola intermedia. `--inline` ejecuta esa tarea en la terminal actual.
`--context-file` permite aportar contexto explícito a una tarea directa.
Para reanudar, cierra antes la otra interfaz que tenga abierto ese hilo.

Se conservan cwd y las opciones compatibles. Codex y Claude reciben modelo y
esfuerzo; OpenCode, proveedor/modelo y variante. No añade autoaprobación ni cambia permisos.
La apertura indica que el comando fue enviado a la pestaña, no que la tarea haya
terminado. Si Herdr falla después de crearla, se muestran sus IDs: inspecciona
esa pestaña antes de volver a lanzar.

## Skill compartida y plugins empaquetados

La fuente canónica es `plugins/rutevi/skills/jev/`. El paquete incluye manifiestos
`.codex-plugin/plugin.json` y `.claude-plugin/plugin.json`. Los catálogos locales
están en `.agents/plugins/marketplace.json` y `.claude-plugin/marketplace.json`.
El plugin necesita la CLI Rutevi instalada por separado; no incluye dependencias Node.

Instalación local por enlaces, desde el checkout:

```sh
npm run install:codex
npm run install:claude
npm run install:opencode
```

- Codex: `$jev`; enlaza la carpeta de compatibilidad, cuyo SKILL.md y referencias
  apuntan a la fuente compartida. Conserva `/prompts:jev` como acceso equivalente.
- Claude: `/jev`; enlaza directamente la skill compartida en `CLAUDE_CONFIG_DIR/skills`
  o `~/.claude/skills`. `--claude-home` permite probar sin modificar configuración real.
- OpenCode: `/jev`; instala el plugin JS existente y añade la guía de ejecución a
  los mensajes explícitos de tarea. Auto sigue enrutando mensajes sin reinyección.

Alternativa empaquetada (elegir una vía por harness para evitar duplicados):

```sh
codex plugin marketplace add .
codex plugin add rutevi@rutevi
claude plugin marketplace add .
claude plugin install rutevi@rutevi
```

En sesión nueva, Codex descubre `$rutevi:jev`; Claude usa `/rutevi:jev`. La instalación
se comprobó en directorios de configuración temporales. Estos comandos no implican
que se haya instalado el plugin en la configuración personal del usuario.

## Flujo de ejecución

El agente principal interpreta la tarea, reúne capacidades reales y propone subtareas
cuando conviene. `rutevi invoke` acepta JSON por stdin: sin interpolación en shell ni
necesidad de Herdr. Contrato y ejemplos en
`plugins/rutevi/skills/jev/references/requests.md`.

- `assign`: elige entre candidatos `current`, `subagent` y `external` aportados por
  el host. Hasta ocho tareas independientes en una llamada Jev; cada una incluye
  su propio catálogo. Se validan IDs, campos y límites. Metadatos extra se excluyen.
  La elegibilidad requiere capacidad suficiente; los errores no disparan delegación.
- `route`: selección con las políticas existentes de Codex, Claude u OpenCode.
- `run`: selección y ejecución no interactiva. Stdout conserva la salida del
  ejecutor; stderr termina con el recibo del proceso; exit code conserva el fallo.
- `open`: selección y apertura Herdr explícita; fuera de Herdr falla antes de
  seleccionar. Nunca abre una TUI anidada desde la skill.

`assign` devuelve una decisión, no ejecuta herramientas ni cambia el modelo principal.
La skill hace que el host aplique el resultado usando las herramientas que tenga,
espere a los workers, integre y verifique. Los subagentes pueden tener modelos o
esfuerzos restringidos por el host: esas restricciones delimitan los candidatos.
Un proceso externo recibe contexto explícito y no hereda la conversación. No se
reintentan ejecuciones fallidas o inciertas automáticamente.

Desde 0.9.0, `assign` consulta preferencia y capacidad de cada candidato en un lote.
En 0.12.0, solo con prioridad `economy` y `costRank` completo se selecciona el menor coste estimado entre
candidatos `suitable` con confianza de capacidad >= 0.5; desempata con las
probabilidades de preferencia. Es un umbral inicial, no una probabilidad calibrada
de éxito. Sin costes completos usa preferencia e informa `costBasis: unknown`.
La baja confianza de preferencia no impide elegir si la capacidad está respaldada.
Preserva distribuciones y evaluaciones para explicar la decisión. Distingue
`review-required`, `no-fit`, `needs-context` y errores del servicio. El host aporta
costes relativos: no se inventan precios ni se afirma ahorro medido.
La skill ofrece workers modestos para trabajo ordinario, limita el análisis previo
del coordinador y escala con evidencia de fallos; no obliga a delegar fixes mínimos.
OpenCode usa `balanced` por defecto; `quality` sigue disponible explícitamente.

## OpenCode dentro del chat

Registra `/jev <tarea>`, `/jev auto`, `/jev off` y `/jev status`. Auto es opt-in por
sesión y vuelve a off al reiniciar el servidor/plugin. El hook aplica modelo/variante
al mensaje del mismo hilo. La notificación muestra el valor aplicado aunque el picker
manual no cambie. Hasta 0.10.0 la guía compartida se añadía a `/jev <tarea>` como parte sintética
excluida del contexto de routing posterior. Se conserva el agente elegido por el usuario.
No se presupone que Task permita cambiar el modelo de los subagentes configurados.
Se rechazan adjuntos cuando la petición se enruta solo con evidencia textual.

## Contexto, entorno y retirada

`TYPESAFE_API_KEY` debe estar en el entorno del router. No se almacena ni se pasa
como argumento de shell. Las tareas lanzadas heredan el entorno de su terminal
con esa clave retirada; el routing inicial ya está resuelto. Si usas el plugin
OpenCode por separado, su proceso sí necesita la clave para enrutar por turno.

El lanzador y `invoke` envían a Jev tarea/contexto explícitos, sin cargar chats ni archivos
por defecto. `assign` añade solo metadatos de candidatos aportados por el host. El plugin de chat usa hasta ocho mensajes recientes / 12.000
caracteres. Los historiales completos siguen en Codex/OpenCode/Claude.

```sh
node scripts/install-integrations.mjs codex --uninstall
node scripts/install-integrations.mjs opencode --uninstall
node scripts/install-integrations.mjs claude --uninstall
```

Los instaladores locales solo retiran enlaces de este proyecto; preservan fuentes e historiales.
Para paquetes, usar `codex plugin remove rutevi@rutevi` o `claude plugin uninstall rutevi@rutevi`.
Los instaladores locales aceptan `--codex-home`, `--skills-dir`, `--claude-home` y
`--opencode-home` para instalaciones alternativas.

## Validación

`npm test` cubre routing, argumentos literales, editor Unicode, pegado fragmentado,
redimensionado, detección de Herdr, workspace del caller y errores de apertura.
Validado el 2026-09-20: 49 tests locales y tareas sintéticas reales abiertas en
Herdr con Luna low (Codex) y GLM 5.3 Flash low (OpenCode), ambos elegidos por Jev,
con respuesta correcta y TUI abierta para continuar. Se verificó el flujo `$jev`
mediante su helper y el envío directo desde la barra del router.
Claude Code 2.1.273: Jev eligió Sonnet low y abrió su TUI en Herdr; el diálogo de
confianza de la carpeta impidió completar la inferencia. No se aceptó ni se
cambió configuración. Fable se cubrió con pruebas de política, no de acceso.
No constituye un benchmark de calidad de modelos.

Nota de compatibilidad: OpenCode 1.18.31 anuncia `run --interactive` pero su
implementación comprueba otro flag y puede terminar tras una respuesta. `session`
y `chat` usan la TUI nativa con `--prompt`. Contrato de variante: [hook de mensajes](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/plugin/src/index.ts).

## Evidencia 0.8.0 (2026-09-21)

- Manifiestos Codex y Claude validados; skill validada; instalación real de ambos
  paquetes en configuraciones temporales. Codex App Server devolvió `rutevi:jev`
  habilitada sin errores de discovery.
- Una llamada real de Jev resolvió dos tareas sintéticas: fix conocido → agente
  actual; revisión independiente de concurrencia → especialista ofrecido. 634 ms,
  `jev-1.13.0`. No se lanzaron esos candidatos ficticios.
- Las pruebas offline cubren límites, candidatos inválidos, fallos de API, recibos,
  passthrough de prompts literales, instalación/desinstalación y hooks OpenCode.
- `invoke run` ejecutó Codex Luna low en read-only y devolvió `RUTEVI_BRIDGE_OK`
  con exit 0. OpenCode 1.18.31 cargó `/jev`, persistió la guía con IDs de parte,
  sesión y mensaje, eligió GLM 5.3 Flash y respondió `RUTEVI_OPENCODE_OK` sin herramientas.
- La prueba de inferencia de Claude terminó con `Not logged in`; instalación y
  manifiesto sí pasaron. Falta validar ejecución con una sesión Claude autenticada.
- La suite completa de mutaciones pasó el umbral 50% con 56.37%; tras corregir
  los IDs de OpenCode, su prueba de mutaciones focalizada pasó con 57.33%.
- Esta evidencia comprueba integración y decisiones de muestra; no es benchmark de
  calidad ni validación completa de una implementación multiagente en los tres hosts.

Contratos consultados: [plugins Claude](https://code.claude.com/docs/en/plugins),
[plugins Codex](https://learn.chatgpt.com/docs/build-plugins),
[plugins OpenCode](https://opencode.ai/docs/plugins/),
[Choice Jev](https://docs.typesafe.ai/primitives/choice).

## Evidencia 0.9.0 (2026-09-21)

- `npm run eval:assign`: ocho casos sintéticos, una llamada real a Jev 1.13.0 de 901 ms,
  6.829 tokens de entrada y 1.097 de salida. Cinco tareas ordinarias al perfil modesto,
  arquitectura y fallo repetido a frontera, petición vaga sin ejecutor. Perfiles y
  costes relativos declarados; no benchmark de capacidades ni ahorro monetario.
- Prueba real aislada: Jev seleccionó Codex Luna low; modificó `average.js`, convirtió
  la prueba fallida en tres aprobadas y mantuvo los tests intactos. La sesión informó
  10.974 tokens: el coste de arranque importa en tareas mínimas. Resultado en
  `artifacts/assign-worker-smoke.json`, repetible con `npm run smoke:assign`.
- El objetivo de desplazar trabajo ordinario a modelos modestos no implica un 90 %
  demostrado ni una reducción facturada. Faltan tareas representativas y comparación
  del coste total, incluidos coordinador, Jev, workers, verificación y reintentos.

- Quality final: 130 tests, lint, TypeScript y Knip aprobados. OpenCode balanced real: paginación → Luna, diagnóstico concurrente tras fallos → Astra, objetivo ausente → no_fit.

## Ares-inspired phase routing — 0.10.0

Fuente: [Ares, versión 1](https://arxiv.org/html/2603.07915v1). Adaptación práctica:
seleccionar esfuerzo según el siguiente paso y las observaciones, manteniendo modelo
cuando sea suficiente. No es el router entrenado del paper ni replica sus resultados.
`task.step` aporta objetivo, observación e historial factual acotado; permite bajar
esfuerzo tras resolver la dificultad. Desempate por continuidad solo con costes
completos e iguales y capacidad suficiente. Los hosts aplican cambios en límites
reales de turno/fase; las skills no interceptan cada llamada interna de razonamiento.

Validación local: 136 tests y quality; mutaciones de assign 72.50 %. Evaluación Jev
por fases: 9/9, tres secuencias low/high/low; regresión de tareas completas 8/8.
Los primeros ensayos detectaron juicio de capacidad demasiado amplio y un historial
que omitía hechos: se corrigieron la pregunta y el suministro de resultados reales.

Smoke en Codex App Server: mismo modelo Luna y mismo hilo durante tres turnos,
esfuerzos low/high/low, marcador recordado y explicación de deadlock correcta al
inspeccionarla. Comparación con otro hilo high/high/high. Tokens reportados:

| Modo | Entrada | Entrada cacheada (subconjunto) | Salida | Razonamiento | Total |
|---|---:|---:|---:|---:|---:|
| Adaptativo | 58.597 | 33.024 | 91 | 17 | 58.688 |
| Alto fijo | 49.087 | 41.216 | 177 | 95 | 49.264 |

Uso Jev se conserva separado en `artifacts/effort-smoke.json`. Los campos se reportan
como los devuelve el host; no sumar razonamiento de nuevo a salida sin verificar el
contrato del proveedor. Una única prueba sintética, con diferencias de contexto/cache,
no establece causalidad ni ahorro monetario: aquí bajó razonamiento pero subió el total.
Scripts: `npm run eval:effort`, `npm run smoke:effort`. Se requieren muestras de coding
representativas, control del contexto y precios efectivos para evaluar coste total.

## Jev antes del ejecutor — 0.11.0

- Codex: `rutevi direct` (terminal por líneas, sin TUI/Herdr) mantiene App Server e hilo.
  `model/list` filtra modelo/esfuerzo contra `codex-direct-policy.json`; el código arma
  candidatos y contexto acotado. Solo Jev toma la decisión antes de `turn/start`.
  No usa un modelo generativo para planificar el routing. `--session` recupera texto
  de turnos anteriores; sin resumidor. `--json` recibe NDJSON y emite eventos.
- Estados sin selección/fallo de Jev nunca llaman al ejecutor. Se validan candidato
  y configuración antes del turno; cerrar durante routing evita iniciar inferencia.
  No reintenta ejecuciones inciertas. Permisos heredados salvo `--sandbox` explícito;
  peticiones interactivas de aprobación/herramientas de cliente no implementadas se
  rechazan, no se aprueban automáticamente.
- OpenCode: `/jev <tarea>` ya tenía hook previo. Se retiró la inyección completa de
  skill, eliminando contexto extra y una posible segunda decisión del ejecutor.
  Si devuelve no-fit o fallo de servicio, el hook detiene antes de aplicar fallback.
- Límite: las skills nativas Codex/Claude se ejecutan dentro del turno generativo;
  no se presentan como intercepción previa. Claude run ya enruta antes de iniciar CLI.
- Evidencia Codex: dos turnos reales vía NDJSON, ambos Luna low y mismo hilo, recuerdo
  correcto; decisiones Jev de 726 y 272 ms. Reanudación real posterior recuperó marcador
  con Luna low, Jev 1.177 ms. Sin turno de preparación ni agente construyendo candidatos.
  No demuestra ahorro monetario global ni elimina tokens de instrucciones del ejecutor.

- Validación final 0.11.0: 149 tests, lint, TypeScript y Knip aprobados; mutaciones
  direct-codex/opencode-plugin 56.44 %. Smoke OpenCode completo aprobado: GLM inicial,
  Spark con recuerdo, auto a GLM y off respetando Luna manual. Plugin Codex instalado
  en perfil habitual, manifiesto Claude validado. No se modificaron credenciales.

## Mejor ajuste a la tarea — 0.12.0

`balanced` por defecto deja ganar la preferencia Jev entre candidatos capaces, sin
sobrescribirla por precio. `quality` prioriza profundidad/fiabilidad, `speed` usa
latencia y `economy` coste cuando los ranks están completos. Rank de coste no equivale
a latencia. Se conserva el filtro de capacidad incluso bajo urgencia.

Direct Codex añade Terra medium/high al catálogo configurado y verifica soporte
nativo. Claude reemplaza la clasificación Sonnet/Fable por candidatos Haiku (sin
flag effort), Sonnet, Opus y Fable; rutas sin selección/servicio fallido no ejecutan
fallback silencioso. Aliases y límites basados en documentación oficial:
https://platform.claude.com/docs/en/models/overview y https://code.claude.com/docs/en/model-config.
Acceso Claude no comprobado: `claude auth status` reporta `loggedIn:false`.

Evaluación: 48/48 selecciones, 16 casos repetidos con tres órdenes de candidatos.
Codex: 6 Luna, 6 Terra, 9 Astra y 3 sin objetivo. Claude: 3 Haiku, 3 Sonnet,
6 Opus, 9 Fable y 3 sin objetivo. Sin pedir el modelo esperado en el prompt;
un caso usa como evidencia el fracaso previo de Opus, no como elección solicitada.
Son expectativas de política, no etiquetas de superioridad obtenidas ejecutando cada
modelo. Resultados completos y distribuciones en artifacts/task-fit-eval.json.

Validación 0.12.0: 154 tests y quality aprobados; mutaciones de assign/claude/direct-codex 67.60 %. Regresiones de asignación 8/8 y de esfuerzo 9/9 aprobadas.
