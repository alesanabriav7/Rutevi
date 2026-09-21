# Rutevi

Ejecuta **`rutevi`** para abrir la TUI. Elige Codex, OpenCode o Claude y escribe
la tarea; Jev selecciona el modelo. `router-jev` sigue como alias compatible.

El proyecto vive en `~/dev/rutevi`; `~/dev/router-jev` es un enlace de compatibilidad.

Consulta Jev **antes** de iniciar Codex, OpenCode o Claude. Jev clasifica la tarea o
elige entre candidatos disponibles; código local aplica modelo y variante.
No invoca Astra para decidir el routing. Codex sigue siendo el harness por defecto.

## Lanzador interactivo y Herdr

```sh
rutevi                                      # Barra de tareas; Enter enruta y abre.
rutevi --harness opencode            # Empieza con OpenCode.
rutevi --harness claude              # Empieza con Claude Code.
rutevi session "Implementa esta mejora"      # Abre la tarea directamente.
```

Jev elige modelo/esfuerzo antes de abrir el harness nativo en una nueva pestaña de
Herdr por defecto. Escribe la tarea directamente: **no necesita `/jev` dentro de Jev**.
El historial queda arriba y la barra fija abajo. El selector visible permite elegir
Codex, OpenCode o Claude con clic o Tab, sin perder el borrador. Enter envía
la tarea al destino seleccionado; Tab también permite alternar. Fuera de Herdr usa la terminal actual; `--inline` evita la pestaña
inicial del router. `--session ID` continúa un hilo cerrado en otra interfaz.

Dentro de Herdr tienes dos controles adicionales, con clic o teclado:

- **Ctrl+O:** pestaña, panel a la derecha o panel abajo.
- **Ctrl+G:** ir a la tarea o quedarse en Rutevi para preparar la siguiente.

```sh
rutevi --layout right --background
rutevi --inline --layout down
```

Tab, Ctrl+O y Ctrl+G no colisionan con los atajos predeterminados de Herdr
(prefijo Ctrl+B), ni con el foco de agentes Ctrl+1…9 de esta instalación.
No requieren Option/Alt. F1–F5 siguen como alias; en pantallas compactas
`^O` y `^G` significan Ctrl+O y Ctrl+G.

`--layout` determina dónde se abren las **tareas**; `--inline` decide dónde se
abre el **router**. El router inicial sigue abriéndose en una pestaña con foco.
Las opciones se conservan durante esa ejecución. Cada panel nace en el directorio
elegido, dentro del workspace del router. Si el panel es demasiado pequeño para
dividirlo, Rutevi pide elegir una pestaña, sin crear un destino alternativo.
Los controles se bloquean durante el lanzamiento; el borrador sigue editable.
La interfaz adapta los controles y el historial a terminales estrechas.
Fuera de Herdr se muestra LOCAL y se usa la terminal actual.

Prueba manual de integración sin llamar modelos: `node scripts/smoke-herdr.mjs`.
Crea un panel temporal, comprueba la ejecución y el foco y cierra ese panel.

`$jev <tarea>` desde Codex ahora abre la tarea en Herdr con el modelo elegido.
Solo recomienda cuando se pide expresamente. La integración OpenCode `/jev`
existente sigue disponible como alternativa para routing por turno en su chat.

[Instalación, comandos, límites y pruebas](INTEGRATIONS.md). Todas las fuentes
están en `integrations/`, `src/` y `scripts/` de este proyecto; se instalan enlaces.

## Claude Code

Requiere `claude` instalado y autenticado. Se puede elegir con Tab en la TUI,
`--harness claude` en `session`/`chat`/`run`/`route`, o pedir Claude al invocar `$jev`.

```sh
rutevi session --harness claude "Implementa esta mejora"
rutevi route --harness claude "Investiga este fallo"
rutevi session --harness claude --model opus --effort high "Tu tarea"
```

Jev clasifica la tarea: simple → Sonnet low; implementación ordinaria → Sonnet
medium; compleja o incierta → Fable high. Fallback por baja confianza o error de
servicio permanece en Fable, informado explícitamente. `--model` evita Jev.
La política vive en `src/claude.js`; son alias nativos que respetan el proveedor
configurado, no un ranking medido. Acceso y límites los aplica Claude Code.

La TUI nativa recibe `--model`, `--effort`, tarea/contexto y `--resume` si se pide.
Se conserva `CLAUDE_CONFIG_DIR`. No se alteran permisos ni se aceptan diálogos de
confianza. `--sandbox`/`--ephemeral` de Codex y opciones exclusivas de OpenCode se
rechazan antes de enrutar. `run --json` usa el stream JSON nativo de Claude.

Validado con Claude Code 2.1.273: Jev → Sonnet low → pestaña de Herdr. La apertura
real se detuvo en el diálogo de confianza de la carpeta; no se validó inferencia
ni acceso a Fable. Los tests locales cubren política, fallback, argumentos,
reanudación y ciclo de los tres harnesses.
Fuentes: [modelos y esfuerzo](https://code.claude.com/docs/en/model-config),
[CLI](https://code.claude.com/docs/en/cli-reference).

## OpenCode

Requiere `opencode` instalado y sus proveedores conectados con `opencode auth`.
El launcher usa esas conexiones; no copia credenciales de proveedores.

```sh
# Descubre candidatos con los modelos, variantes y costes del catálogo local.
rutevi models --harness opencode

# Solo elegir: sin ejecutar la tarea.
rutevi route --harness opencode "Corrige un typo en un literal"
rutevi route --harness opencode "Diseña una migración sin downtime"

# Ejecutar desde el directorio del proyecto.
rutevi run --harness opencode "Implementa paginación y sus tests"
rutevi chat --harness opencode "Investiga este error"

# Ajustar preferencia o elegir explícitamente (omite Jev).
rutevi route --harness opencode --preference fast "Escribe una consulta SQL"
rutevi run --harness opencode --model opencode-go/glm-5.3-flash --variant low "Tu tarea"

# Agente y contexto explícitos.
rutevi run --harness opencode --agent plan --context-file ./resumen.txt "Analiza el cambio"
```

OpenCode usa una elección directa de modelo en una llamada a Jev. La política
editable está en `opencode-policy.json`; `--policy otra-politica.json` permite
añadir modelos y roles sin cambiar código. No envía los 100+ modelos a Jev:
intersecta una lista deliberada de candidatos con `opencode models --verbose`.

| Rol inicial | Modelo preferido | Variante |
|---|---|---|
| Mecánica, extracción, respuestas cortas | Go / GLM 5.3 Flash | low |
| SQL, algoritmos y transformaciones acotadas | Go / DeepSeek V4.1 Flash (desactivado) | high |
| Trabajo sustancial que requiera GLM | Go / GLM 5.3 | high |
| Demostraciones o razonamiento algorítmico difícil | Go / DeepSeek V4 Pro (desactivado) | high |
| Implementación, tests y debugging ordinario | OpenAI / GPT 5.6 Luna | medium |
| Arquitectura, diagnóstico difícil, incertidumbre | Zen / GPT 6 Astra | high |
| Código largo con requisitos cambiantes | Zen / Muse Spark 1.3 estándar | high |
| Matemáticas y algoritmos difíciles | Go / Qwen3.8 Max | xhigh |
| Automatización prolongada con herramientas | Go / MiniMax M3 | thinking |
| Frontend e iteración visual | Go / Kimi K3 | max |
| Investigación documental más implementación | Zen / Gemini 3.8 Flash | high |
| Proyectos premium de varios días | Zen / Claude Fable 5.1 (desactivado: HTTP 401) | high |

**Preferencia por defecto: `quality`**, según la petición de priorizar modelos
fuertes y actuales. Jev usa capacidades documentadas y encaje con la tarea antes
que precio; para trabajo trivial conserva una opción ligera. Puedes cambiar a
`--preference balanced` o `fast`. La [revisión de modelos](MODEL-REVIEW.md) incluye
fuentes primarias, fechas, pruebas y límites. `reviewedAt` en la política registra
la revisión manual; no hay actualización automática de versiones por nombre.

**Acceso comprobado el 2026-09-20:** Go rechazó DeepSeek V4.1 Flash, V4 Flash
y V4 Pro con HTTP 403 `RegionError`: requiere consentimiento explícito para
alojamiento en China. No se cambió la cuenta. Los dos roles DeepSeek permanecen
en la política con `enabled: false` y el motivo; Jev elige entre los nueve
candidatos. `models` muestra también los desactivados. Tras configurar y verificar
el acceso, se pueden reactivar editando `enabled`; no basta con figurar en catálogo.

Son **preferencias de routing fundamentadas, no un ranking de calidad medido**.
Más modelos dan más alternativas; no prueban mayor precisión. Jev recibe los roles,
fechas de lanzamiento, evidencia de fabricantes, ventanas de contexto y costes
reportados por el catálogo. `fast`, `balanced` y
`quality` orientan la elección, sin prometer latencia ni calidad determinadas.
Los costes del catálogo son referencias por millón de tokens: cero en OpenAI
OAuth no significa uso gratuito o ilimitado, y Go conserva cuotas y posibles
variaciones de precio. No se consulta el saldo/cuota restante.

Cada candidato lista proveedores en orden, priorizando Go/OpenAI cuando tienen
acceso verificado. Astra usa Zen: OpenAI OAuth lo rechazó con HTTP 400 durante
las pruebas de sesión; el probe Zen sí pasó y consume su saldo.
La existencia en catálogo no prueba saldo, autorización efectiva ni salud del
endpoint. Se comprueban IDs, tool calling y variantes antes de invocar Jev; si el
fallback configurado falta, se detiene y solicita corregir la política. No hay
reintentos de tareas ni cambio de proveedor después de una ejecución fallida.

Si Jev falla o responde `no_fit`, usa el fallback declarado. Una distribución
repartida entre modelos adecuados no fuerza por sí sola un salto al más caro.
`--model provider/model` valida el ID y evita Jev; `--variant` debe existir para
el modelo elegido. La clave de TypeSafe tampoco llega al proceso OpenCode.

`--sandbox`, `--ephemeral` y `--effort` son exclusivos de Codex: OpenCode los
rechaza antes de consultar Jev. OpenCode hereda sus propios permisos y conserva
sus sesiones; el launcher no añade `--auto` ni simula un sandbox equivalente.
`chat` abre la TUI nativa de OpenCode con la tarea y elige modelo solo al inicio.
`session` añade el lanzador interactivo y apertura de tareas en Herdr.

## Auditoría manual de modelos

```sh
rutevi audit                  # Refresca catálogo, compara y guarda informe.
rutevi audit --json           # Informe completo también en stdout.
rutevi audit --cached         # Solo catálogo local, sin refrescar caché.
# Desde este repositorio: npm run audit:models
```

No requiere TypeSafe ni ejecuta inferencia. Detecta altas/bajas desde la ejecución
anterior, cambios de precio/contexto/variantes y problemas de la política activa.
Lista aparte modelos fuera de la política y fechas posteriores a `reviewedAt`;
no considera todos los modelos nuevos en la primera ejecución. Señala revisión
pendiente por candidatos/cambios o por 14 días de antigüedad de la política.
No hay ejecución programada ni activación automática.

Guarda `artifacts/model-audit/latest.json` y `snapshot.json` en rutevi.
`--output <carpeta>` permite baselines separados; si cambia `--cwd`, crea una
referencia nueva porque el catálogo depende de la configuración del proyecto.
El informe anterior se reemplaza, y observar el catálogo no actualiza `reviewedAt`.

Para investigación y actualización completa, pide al agente:
**«Ejecuta la tarea ~/dev/rutevi/tasks/audit-models.md»**.
La [tarea](tasks/audit-models.md) incluye fuentes oficiales, pruebas selectivas de
acceso que consumen cuota, evaluación de roles y actualización documentada.
El inventario por sí solo no busca en Internet ni demuestra calidad o acceso.

Validación: 25 tests locales aprobados; auditoría real de 113 modelos y segunda
ejecución sin falsos cambios. No se usaron inferencias pagadas para esta función.

## Uso

Para Codex requiere Node.js 22+, Codex CLI autenticado (`codex login`) y
`TYPESAFE_API_KEY` en el entorno. Usa la sesión de Codex existente, incluida
autenticación ChatGPT; Jev usa su propia API de TypeSafe.

```sh
cd ~/dev/rutevi
npm ci --ignore-scripts
npm link --ignore-scripts

# Clasificación únicamente: no arranca Codex.
rutevi route "Corrige un typo en el README"

# Ejecutar una tarea nueva desde el directorio de tu proyecto.
rutevi run "Añade tests para la paginación existente"

# Abrir la interfaz de terminal de Codex con el modelo elegido.
rutevi chat "Investiga la causa de este fallo intermitente"

# Contexto explícito para peticiones como «hazlo»; rutas relativas al cwd del shell.
rutevi route --context-file ./resumen.txt "Hazlo"

# Elegir proyecto y limitar el sandbox para una consulta.
rutevi run --cwd ~/dev/rutevi --sandbox read-only "Explica la estructura"

# Tu selección explícita prevalece y evita llamar a Jev.
rutevi run --model gpt-6-astra --effort high "Compara estos diseños"

# Eventos de Codex por stdout, decisión del router por stderr.
rutevi run --json --ephemeral "Responde únicamente 17 por 23"
```

## Política inicial

| Categoría | Modelo | Esfuerzo |
|---|---|---|
| `simple`: mecánica, extracción, traducción, preguntas básicas | `gpt-5.6-luna` | `low` |
| `standard`: implementación acotada, bug ordinario, investigación | `gpt-5.6-luna` | `medium` |
| `complex`: arquitectura, diagnóstico difícil, intentos fallidos | `gpt-6-astra` | `high` |
| `unclear`: falta el objetivo o contexto para interpretarlo | `gpt-6-astra` | `high` |

La política de Codex se edita en `src/router.js`. `unclear` escala a un modelo capaz de recuperar
contexto o preguntar; no inventa una tarea. Confianza inferior a `0.5` o error
de servicio también usan Astra high y lo indican en `source`. `--effort`
prevalece incluso en fallback. Una clave ausente es un error de configuración
y detiene el comando. Hay un presupuesto de 10 segundos para Jev, sin reintentos.
El umbral es una heurística inicial, no una calibración de precisión. El router
no verifica disponibilidad de modelos: si Codex rechaza el modelo, propaga el
fallo y no reejecuta la tarea automáticamente.

## Alcance y datos

- `run`/`chat` son launchers de CLI y crean una sesión nueva. `chat` enruta
  únicamente la petición inicial; los mensajes posteriores quedan en el harness.
- No intercepta el compositor de la app de escritorio ni cambia su modelo activo.
  Los instaladores enlazan una skill/prompt de Codex y un plugin OpenCode.
  `session` es un lanzador de tareas nativas en Herdr. El plugin OpenCode conserva
  su routing por turno; consulta INTEGRATIONS.md.
- Envía a TypeSafe la petición, el archivo indicado con `--context-file` y, para
  OpenCode, roles y metadatos permitidos de los candidatos (nunca headers/opciones).
  `route`/`run`/`chat`/`session` no cargan automáticamente conversaciones ni AleWik.
  La skill aporta un resumen explícito; el plugin OpenCode usa texto reciente acotado.
- El contexto explícito también llega al harness. Límite conjunto: 64 KB.
- La clave se obtiene del entorno, no se guarda y se excluye del entorno del
  proceso Codex lanzado. No se registran prompts ni contexto en archivos propios;
  Codex conserva su comportamiento normal de historial salvo `--ephemeral`.
- Hereda configuración, permisos y sandbox de Codex, salvo `--sandbox` explícito.
  No añade flags de bypass. `run` ignora stdin; pasa toda la petición como argumento.
- La decisión se imprime antes de iniciar Codex, con modelo Jev real, confianza,
  distribución, latencia y uso de tokens. No afirma que confianza sea probabilidad
  de completar correctamente la tarea.

## Calidad y pruebas

Requiere Node.js 22.12+, 24 o 26+ y `npm ci`.

```sh
npm run quality        # Oxlint + TypeScript estricto + Vitest/fast-check + Knip 6.
npm run quality:full   # Lo anterior y Stryker (mutaciones).
npm run test:watch     # Vitest en modo interactivo.
npm run test:mutation  # Solo Stryker; informes HTML/JSON en reports/mutation/.
```

`tsconfig.json` verifica todo `src/` con `strict`, `checkJs` y `noEmit`.
Los contratos están en JSDoc y `src/types.d.ts`; el CLI continúa ejecutándose
como JavaScript sin compilación. Los scripts de integración y los tests no
forman parte del chequeo de tipos. Oxlint no admite warnings y Knip 6 detecta
archivos, exports y dependencias sin uso, incluyendo las entradas externas
de las integraciones. `opencode` es un binario externo esperado en los smokes.

Vitest ejecuta únicamente `test/**/*.test.js`, sin llamar a modelos reales.
fast-check usa 200 casos por propiedad y semilla fija `20260921` para reproducir
fallos; el error incluye el path del contraejemplo. Stryker muta los módulos de
`src/` salvo el punto de entrada `src/cli.js`, ejecutado por subprocesos en los
tests. El umbral inicial de mutación es 50%; 60% marca el nivel intermedio y 80%
es el objetivo alto. El umbral cuenta también código sin cobertura; no se
excluyen mutadores para elevar artificialmente el resultado. El workflow
`.github/workflows/quality.yml` ejecuta calidad y mutaciones como jobs separados
en pushes y pull requests, y conserva el informe de mutaciones.

Validación local (2026-09-21): 74 tests aprobados en Node 22 y 26;
Stryker detectó 1.353 de 2.482 mutaciones (54,51%, incluidos 50 timeouts).
La TUI y los lanzadores conservan huecos de cobertura visibles en el informe.

TypeScript queda en la serie 6: Stryker 10 utiliza su API de compilador, que
TypeScript 7 ya no expone de la misma forma.

```sh
npm test           # Sin red ni modelos: política, CLI y contrato del proceso.
npm run eval:live  # Siete casos sintéticos; usa la API real de TypeSafe.
npm run eval:opencode # Doce casos con catálogo OpenCode y Jev real.
npm run smoke:opencode # Ejecuta tareas sintéticas reales en OpenCode; consume cuota.
npm run probe:models -- opencode/muse-spark-1.3 # Comprueba acceso/salida JSON; guarda resultado sanitizado.
npm run smoke:codex-session # Prueba varios turnos y cambio de modelo en Codex.
npm run smoke:opencode-session # Prueba /jev, auto/off y continuidad; requiere plugin.
```

Validado el 2026-09-20 con Codex CLI 0.155.1 y `jev-1.13.0`:
los siete casos sintéticos eligieron la categoría esperada (217–587 ms por
consulta en esa corrida). Prueba completa: Jev → Luna low → Codex respondió
`391` a `17 × 23`, con sandbox read-only. No es un benchmark general de calidad.
La interfaz interactiva requiere TTY; su uso humano prolongado no está validado.

OpenCode 1.18.31: GLM 5.3 Flash completó una corrección de literal mediante
selección automática de Jev y GPT Luna respondió con selección explícita.
En la ampliación inicial, 20 tests locales y 7/7 casos Jev pasaron; las sesiones
confirmaron proveedor/modelo efectivos. En la revisión 0.3.0 pasaron 21 tests
locales y 12/12 casos Jev con nueve candidatos activos. Cinco modelos nuevos
superaron el probe de acceso/salida JSON; Fable 5.1 y Sonnet 5 devolvieron HTTP 401.
Los tres smokes de GLM, GPT y Spark pasaron; Spark se seleccionó mediante Jev
y se ejecutó con variante high.
Los errores de acceso DeepSeek se propagaron con exit 1 sin reintentar ni cambiar
de proveedor. Los casos de selección prueban adhesión a la política, no calidad
comparativa de los modelos. Las pruebas no modifican ajustes de la cuenta.

Fuentes: [TypeSafe SDK](https://docs.typesafe.ai/sdk/javascript),
[Choice](https://docs.typesafe.ai/primitives/choice),
[Codex CLI](https://learn.chatgpt.com/docs/cli/reference),
[OpenCode CLI](https://opencode.ai/docs/cli/),
[OpenCode Models](https://opencode.ai/docs/models/),
[OpenCode Go](https://opencode.ai/docs/go/).
