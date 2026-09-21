# Auditar y actualizar modelos de rutevi

Tarea manual para un agente: «Ejecuta tasks/audit-models.md en ~/dev/rutevi».
No es una tarea programada. El comando de inventario no hace investigación web;
esta guía añade investigación, pruebas y actualización de la política.

1. Lee README.md, MODEL-REVIEW.md y opencode-policy.json. Ejecuta `npm run audit:models`.
   Inspecciona `artifacts/model-audit/latest.json`. El primer inventario crea una
   referencia; `added` significa añadido al catálogo desde la observación anterior,
   no necesariamente recién lanzado. `unreviewed` significa fuera de la política,
   no que nunca se haya evaluado. Revisa también modelos sin fecha, retirados,
   variantes incompatibles y cambios de precios/contexto. Una revisión con 14 días
   de antigüedad merece actualización aunque no haya cambios de catálogo.
2. Investiga candidatos relevantes y modelos fuertes nuevos en fuentes oficiales
   de proveedores y OpenCode. Busca fuera del catálogo también: puede ir retrasado.
   Confirma identificadores, lanzamiento, herramientas, contexto, precio y acceso.
   Prioriza adecuación y evidencia; más reciente no demuestra mejor calidad.
   Distingue afirmaciones del fabricante de benchmarks independientes.
3. Contrasta MODEL-REVIEW.md y artifacts/model-probes.json. Conserva bloqueos por
   región, autenticación y consentimiento: no actives Contributor, no cambies
   opt-ins ni credenciales para resolverlos. Un ID listado no prueba acceso.
4. Para candidatos prometedores ejecuta selectivamente
   `npm run probe:models -- proveedor/modelo` (consume cuota real; petición sintética,
   sin archivos privados). No pruebes todo el catálogo. El probe verifica acceso y
   formato; para afirmar mejoras de calidad compara tareas representativas.
5. Si hay evidencia y acceso, actualiza candidatos/roles/fuentes de la política,
   manteniendo fallback válido y el límite de 30 candidatos. Añade casos relevantes
   de evaluación. Ejecuta `npm test`; si cambias roles, `npm run eval:opencode` y
   smoke dirigido cuando corresponda. No ejecutes tareas reales del usuario.
6. Actualiza MODEL-REVIEW.md con candidatos aceptados, descartados, bloqueados,
   fuentes, fecha y límites de las pruebas; actualiza README si cambia el uso.
   Actualiza reviewedAt solo tras completar la revisión, no por refrescar catálogo.
   Informa qué cambió y qué queda pendiente. No hagas commit/push automáticamente.

Inventario solamente: `rutevi audit`. JSON: `rutevi audit --json`.
Sin refrescar caché: `rutevi audit --cached`. Para otro proyecto, usa `--cwd`
y una carpeta `--output` propia si quieres conservar baselines separados.
El informe latest.json se reemplaza en cada ejecución; snapshot.json conserva
la observación anterior para la siguiente comparación, no una aprobación.
