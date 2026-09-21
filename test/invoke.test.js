import { test, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { invoke, readRequest } from '../src/invoke.js';

const request = { action: 'run', harness: 'codex', prompt: 'Fix `literal` $(literal)\n--help', cwd: tmpdir() };
const route = { model: 'available', effort: 'high', source: 'jev' };

test('JSON reader preserves split UTF-8 and rejects oversize and malformed input', async () => {
  const bytes = Buffer.from(JSON.stringify({ prompt: '👩‍💻 Bogotá' }));
  expect(await readRequest(Readable.from([...bytes].map(b => Buffer.from([b]))))).toEqual({ prompt: '👩‍💻 Bogotá' });
  await expect(readRequest(Readable.from(['x'.repeat(64001)]))).rejects.toThrow('64 KB');
  await expect(readRequest(Readable.from(['{not json']))).rejects.toThrow('JSON');
});

test('routes only when requested and passes assignment requests to the inventory router', async () => {
  const select = vi.fn(async () => route), launch = vi.fn(), assign = vi.fn(async () => ({ assignments: [] }));
  expect(await invoke({ ...request, action: 'route' }, { select, launch })).toEqual({ action: 'route', route });
  expect(launch).not.toHaveBeenCalled();
  expect(await invoke({ action: 'assign', tasks: [] }, { assign })).toEqual({ action: 'assign', assignments: [] });
});

test('unclear goals can be inspected but never launch an executor', async () => {
  const select = async () => ({ ...route, category: 'unclear' });
  const launch = vi.fn();
  expect(await invoke({ ...request, action: 'route' }, { select })).toMatchObject({ route: { category: 'unclear' } });
  await expect(invoke(request, { select, launch })).rejects.toThrow('Clarify');
  expect(launch).not.toHaveBeenCalled();
});

test.each(['codex', 'claude', 'opencode'])('run uses the selected %s model and literal prompt without shell interpolation', async harness => {
  const selected = { model: harness === 'opencode' ? 'provider/model' : 'available', effort: 'high', source: 'jev', variant: 'high' };
  const launch = vi.fn(async () => 7);
  const result = await invoke({ ...request, harness }, { select: async () => selected, launch });
  expect(result).toMatchObject({ status: 'process-failed', exitCode: 7, route: selected });
  const [options, executable, args] = launch.mock.calls[0];
  expect(executable).toBe(harness);
  expect(options.command).toBe('run');
  expect(args).toContain(selected.model);
  expect(args).toContain(request.prompt);
  expect(args).not.toContain('--dangerously-skip-permissions');
  if (harness === 'claude') expect(args).toContain('--print');
  else expect(args[0]).toBe(harness === 'codex' ? 'exec' : 'run');
});

test('open never launches a nested TUI outside Herdr', async () => {
  vi.stubEnv('HERDR_ENV', '');
  const select = vi.fn(), open = vi.fn();
  try {
    await expect(invoke({ ...request, action: 'open' }, { select, open })).rejects.toThrow('Herdr');
    expect(select).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});

test('open in Herdr returns the actual task identity', async () => {
  vi.stubEnv('HERDR_ENV', '1');
  try {
    expect(await invoke({ ...request, action: 'open' }, { select: async () => route,
      open: async () => ({ tabId: 'tab', paneId: 'pane' }) })).toEqual({ action: 'open', tabId: 'tab', paneId: 'pane' });
  } finally { vi.unstubAllEnvs(); }
});

test.each([
  { action: 'shell' }, { harness: 'sh' }, { prompt: '' }, { context: {} },
  { sandbox: 'danger-full-access' }, { harness: 'claude', sandbox: 'read-only' },
  { harness: 'opencode', effort: 'high' }, { variant: 'high' }, { effort: 'unknown' },
])('invalid invocation fails before routing or spawning', async extra => {
  const select = vi.fn();
  await expect(invoke({ ...request, ...extra }, { select })).rejects.toThrow();
  expect(select).not.toHaveBeenCalled();
});

test('CLI bridge preserves real process output and failure status, strips the routing key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rutevi-bridge-'));
  try {
    await writeFile(join(root, 'codex'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),keyPresent:Boolean(process.env.TYPESAFE_API_KEY)}));process.exitCode=19;\n', { mode: 0o755 });
    const child = spawn(process.execPath, [new URL('../src/cli.js', import.meta.url).pathname, 'invoke'], {
      env: { ...process.env, PATH: root + ':' + process.env.PATH, TYPESAFE_API_KEY: 'secret-sentinel' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    const exit = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    child.stdin.end(JSON.stringify({ ...request, cwd: root, model: 'chosen', effort: 'low' }));
    expect(await exit).toBe(19);
    const output = JSON.parse(stdout);
    expect(output.args.at(-1)).toBe(request.prompt);
    expect(output.args).toContain('chosen');
    expect(output.keyPresent).toBe(false);
    expect(stderr).toContain('"status":"process-failed"');
    expect(stderr).toContain('"source":"explicit"');
    expect(stdout + stderr).not.toContain('secret-sentinel');
  } finally { await rm(root, { recursive: true, force: true }); }
});
