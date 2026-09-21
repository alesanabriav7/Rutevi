import { test, expect, vi } from 'vitest';
import fc from 'fast-check';
import { PassThrough } from 'node:stream';
import { codexArgs } from '../src/codex.js';
import { Editor, plainText } from '../src/session/editor.js';
import { parseSessionInput } from '../src/session/commands.js';
import { terminalInput } from '../src/session/terminal-input.js';
import { selectTask } from '../src/session/dispatch.js';

const route = { model: 'chosen', effort: 'high', source: 'explicit' };

test('Codex run and chat expose only the requested options', () => {
  expect(codexArgs({ command: 'run', cwd: '/project', prompt: 'task', json: true, ephemeral: true, sandbox: 'read-only' }, route)).toEqual([
    'exec', '--skip-git-repo-check', '-m', 'chosen', '-c', 'model_reasoning_effort="high"', '-C', '/project', '-s', 'read-only', '--json', '--ephemeral', '--', 'task',
  ]);
  expect(codexArgs({ command: 'chat', cwd: '/project', prompt: 'task' }, route)).toEqual([
    '-m', 'chosen', '-c', 'model_reasoning_effort="high"', '-C', '/project', '--', 'task',
  ]);
});

test.each([
  ['  ', { type: 'empty' }],
  [' /quit ', { type: 'quit' }],
  ['/exit', { type: 'quit' }],
  ['/help', { type: 'help' }],
  ['/jev status', { type: 'status' }],
  ['  ordinary text  ', { type: 'task', prompt: 'ordinary text', route: false }],
  ['/jev   task  ', { type: 'task', prompt: 'task', route: true }],
])('session command %j has the expected meaning', (input, expected) => {
  expect(parseSessionInput(input)).toEqual(expected);
});

test('editor navigation clamps at both ends and deletion operates at the cursor', () => {
  const editor = new Editor();
  editor.set('a👩‍💻b');
  editor.key('right');
  expect(editor.cursor).toBe(3);
  editor.key('home');
  editor.key('left');
  expect(editor.cursor).toBe(0);
  editor.key('right');
  expect(editor.cursor).toBe(1);
  editor.key('delete');
  expect(editor.text).toBe('ab');
  expect(editor.cursor).toBe(1);
  editor.key('C-k');
  expect(editor.text).toBe('a');
  editor.key('C-u');
  expect(editor.text).toBe('');
  expect(editor.cursor).toBe(0);
  editor.set('one two ');
  editor.key('C-w');
  expect(editor.text).toBe('one');
  expect(editor.cursor).toBe(3);
  editor.key('C-a');
  expect(editor.cursor).toBe(0);
  editor.key('C-e');
  expect(editor.cursor).toBe(3);
});

test('editor enforces the UTF-8 byte boundary without losing the current draft', () => {
  const editor = new Editor();
  expect(editor.insert('é'.repeat(24000))).toBe(true);
  expect(editor.insert('a')).toBe(false);
  expect(editor.text).toBe('é'.repeat(24000));
  expect(editor.cursor).toBe(24000);
  expect(plainText('\x1b[31mred\x1b[0m\r\nnext\tline\x00\x7f')).toBe('red\nnext  line');
});

test('history removes adjacent duplicates, caps at 100 and restores the draft', () => {
  const editor = new Editor();
  for (let i = 0; i < 102; i++) { editor.set(`task ${i}`); expect(editor.submit()).toBe(`task ${i}`); }
  editor.set('task 101'); editor.submit();
  expect(editor.history).toHaveLength(100);
  expect(editor.history[0]).toBe('task 2');
  editor.set('unfinished');
  editor.key('up'); expect(editor.text).toBe('task 101');
  editor.key('down'); expect(editor.text).toBe('unfinished');
  editor.key('down'); expect(editor.text).toBe('unfinished');
});

test('bracketed UTF-8 paste is atomic under arbitrary chunk boundaries', () => {
  fc.assert(fc.property(
    fc.array(fc.constantFrom('a', 'é', '👩‍💻', '\n', '\t', '🇨🇴'), { maxLength: 60 }),
    fc.array(fc.integer({ min: 1, max: 15 }), { minLength: 1, maxLength: 30 }),
    (characters, sizes) => {
      const source = new PassThrough();
      const pasted = [];
      const adapter = terminalInput(source, value => pasted.push(value));
      let keys = '';
      adapter.input.on('data', data => { keys += data.toString(); });
      const text = characters.join('');
      const bytes = Buffer.from(`before\x1b[200~${text}\x1b[201~after`);
      try {
        let offset = 0, index = 0;
        while (offset < bytes.length) {
          const size = sizes[index++ % sizes.length];
          source.write(bytes.subarray(offset, offset + size));
          offset += size;
        }
        expect(pasted).toEqual([text]);
        expect(keys).toBe('beforeafter');
      } finally { adapter.close(); source.destroy(); }
    },
  ), { numRuns: 200, seed: 20260921 });
});

test('oversized paste is rejected atomically and the next paste still works', () => {
  const source = new PassThrough();
  const pasted = [];
  const adapter = terminalInput(source, text => pasted.push(text));
  try {
    source.write('\x1b[200~' + 'x'.repeat(48001));
    source.write('discard this too\x1b[201~');
    source.write('\x1b[200~valid\x1b[201~');
    expect(pasted).toEqual([null, 'valid']);
    expect(source.listenerCount('data')).toBe(1);
  } finally { adapter.close(); source.destroy(); }
  expect(source.listenerCount('data')).toBe(0);
  expect(adapter.input.destroyed).toBe(true);
});

test('standalone Escape is released after the delimiter grace period', () => {
  vi.useFakeTimers();
  const source = new PassThrough();
  const adapter = terminalInput(source, () => { throw new Error('Not a paste'); });
  let keys = '';
  adapter.input.on('data', data => { keys += data.toString(); });
  try {
    source.write('\x1b');
    expect(keys).toBe('');
    vi.advanceTimersByTime(49);
    expect(keys).toBe('');
    vi.advanceTimersByTime(1);
    expect(keys).toBe('\x1b');
    source.write('x');
    expect(keys).toBe('\x1bx');
  } finally { adapter.close(); source.destroy(); vi.useRealTimers(); }
});

test('dispatch rejects empty and oversized tasks before routing and accepts the boundary', async () => {
  const options = { cwd: '/tmp', harness: 'codex', model: 'chosen' };
  await expect(selectTask({ ...options, prompt: '  ' })).rejects.toThrow('Escribe la tarea');
  await expect(selectTask({ ...options, prompt: 'é'.repeat(32001) })).rejects.toThrow('64 KB');
  await expect(selectTask({ ...options, prompt: 'a', context: 'x'.repeat(64000) })).rejects.toThrow('64 KB');
  expect(await selectTask({ ...options, prompt: 'é'.repeat(32000) })).toMatchObject({ model: 'chosen', source: 'explicit' });
  expect(await selectTask({ ...options, harness: 'claude', prompt: 'task' })).toMatchObject({ model: 'chosen', harness: 'claude' });
});
