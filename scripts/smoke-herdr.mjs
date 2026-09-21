// Run manually inside a Herdr pane. Creates and closes only its own test panel.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHerdrTaskTab } from '../src/session/herdr.js';
const exec = promisify(execFile);
if (process.env.HERDR_ENV !== '1') throw new Error('Ejecuta esta prueba dentro de Herdr.');
const call = async args => (await exec('herdr', args, { encoding: 'utf8', timeout: 20000 })).stdout;
const current = JSON.parse(await call(['pane', 'current', '--current'])).result.pane;
const layout = JSON.parse(await call(['pane', 'layout', '--pane', current.pane_id])).result.layout;
const rect = layout.panes.find(pane => pane.pane_id === current.pane_id).rect;
const direction = rect.width >= 100 ? 'right' : 'down';
let created;
try {
  created = await createHerdrTaskTab({ cwd: current.foreground_cwd ?? current.cwd, label: 'Rutevi smoke', layout: direction, background: true, executable: 'printf', args: ['RUTEVI_HERDR_OK\\n'] });
  await call(['pane', 'wait-output', created.paneId, '--match', 'RUTEVI_HERDR_OK', '--timeout', '10000']);
  const after = JSON.parse(await call(['pane', 'layout', '--pane', current.pane_id])).result.layout;
  if (after.focused_pane_id !== layout.focused_pane_id) throw new Error('El foco cambió durante la prueba.');
  console.log(`OK: split ${direction}, ejecución y foco conservado.`);
} finally {
  if (created) await call(['pane', 'close', created.paneId]);
}
