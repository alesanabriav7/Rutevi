# Rutevi: tareas → modelos → pestañas de Herdr

Jev es el lanzador. Escribe una tarea: consulta el router, aplica la selección y
abre Codex, OpenCode o Claude con la petición. No hay que escribir `/jev` dentro de Jev.
El modelo se elige antes de arrancar el harness; Jev no es otro chat de Codex.

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

## `$jev` desde Codex

```sh
cd ~/dev/rutevi
npm run install:codex
```

La instalación enlaza la skill `jev` en `~/.agents/skills/jev` y el prompt en
`$CODEX_HOME/prompts/jev.md` (o `~/.codex/prompts/jev.md`). Las fuentes permanecen
en este proyecto; no se modifican el ejecutable ni los permisos de Codex.

```text
$jev instala Appium/WDA para manejar dispositivos iOS
```

La skill llama `dispatch.mjs` con petición, resumen de contexto, cwd y harness.
Comprueba `HERDR_ENV=1`, consulta Jev y abre la tarea en el workspace del caller.
Devuelve modelo, esfuerzo/variante, origen y tab/pane. No cambia el agente que
recibió `$jev`: el modelo elegido ejecuta en la nueva pestaña.

`/prompts:jev <tarea>` ofrece el mismo flujo por compatibilidad. Si se solicita
explícitamente **solo recomendar**, usa `recommend.mjs` y no abre una tarea.
Fuera de Herdr la skill informa el límite; no abre una TUI anidada en la herramienta.

## Plugin OpenCode: alternativa de routing dentro del chat

```sh
npm run install:opencode
```

El plugin existente sigue disponible para quien quiera routing por turno en
OpenCode nativo, en lugar de lanzar tareas desde Jev. Registra `/jev <tarea>`,
`/jev auto`, `/jev off` y `/jev status`. No es necesario para el lanzador nuevo.
Reinicia OpenCode tras instalarlo.

Auto es opt-in por sesión y vuelve a off al reiniciar el servidor/plugin. La
notificación Jev muestra la selección real; el selector manual puede conservar
su valor. Off vuelve a respetar la selección manual de la interfaz. Los comandos
de control pueden consumir un turno de confirmación. Se rechazan adjuntos cuando
se intenta enrutar solo con evidencia textual; desactiva auto para enviarlos.

## Contexto, entorno y retirada

`TYPESAFE_API_KEY` debe estar en el entorno del router. No se almacena ni se pasa
como argumento de shell. Las tareas lanzadas heredan el entorno de su terminal
con esa clave retirada; el routing inicial ya está resuelto. Si usas el plugin
OpenCode por separado, su proceso sí necesita la clave para enrutar por turno.

El lanzador envía a Jev la tarea y contexto explícito, sin cargar chats ni archivos
por defecto. El plugin de chat usa hasta ocho mensajes recientes / 12.000
caracteres. Los historiales completos siguen en Codex/OpenCode/Claude.

```sh
node scripts/install-integrations.mjs codex --uninstall
node scripts/install-integrations.mjs opencode --uninstall
```

Solo retira enlaces de este proyecto; preserva fuentes e historiales. Acepta
`--codex-home`, `--skills-dir` y `--opencode-home` para instalaciones alternativas.

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
