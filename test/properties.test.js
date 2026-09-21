import { test, expect } from 'vitest';
import fc from 'fast-check';
import { selectRoute } from '../src/router.js';
import { codexArgs } from '../src/codex.js';
import { Editor, plainText } from '../src/session/editor.js';
import { routingContext } from '../src/session/commands.js';
import { taskEnvironment } from '../src/session/task-process.js';

const parameters = { numRuns: 200, seed: 20260921 };

test('routing respects the confidence boundary for every category', () => {
  fc.assert(fc.property(
    fc.constantFrom('simple', 'standard', 'complex', 'unclear'),
    fc.double({ min: 0, max: 1, noNaN: true }),
    (choice, confidence) => {
      const route = selectRoute({ choice, confidence });
      expect(route.source).toBe(confidence < 0.5 ? 'low-confidence-fallback' : 'jev');
      expect(route.model).toBe(confidence < 0.5 || ['complex', 'unclear'].includes(choice) ? 'gpt-6-astra' : 'gpt-5.6-luna');
      expect(route.confidence).toBe(confidence);
    },
  ), parameters);
});

test('arbitrary JSON cannot introduce a routing label outside the allowlist', () => {
  fc.assert(fc.property(fc.jsonValue(), answer => {
    const valid = answer && typeof answer === 'object' &&
      ['simple', 'standard', 'complex', 'unclear'].includes(answer.choice) &&
      typeof answer.confidence === 'number' && Number.isFinite(answer.confidence) &&
      answer.confidence >= 0 && answer.confidence <= 1;
    if (!valid) expect(() => selectRoute(answer)).toThrow('Invalid routing answer');
  }), parameters);
});

test('CLI prompts remain a single literal argument after the option separator', () => {
  fc.assert(fc.property(fc.string(), prompt => {
    const args = codexArgs({ command: 'run', cwd: '/tmp', prompt }, { model: 'test', effort: 'low' });
    expect(args.slice(-2)).toEqual(['--', prompt]);
  }), parameters);
});

test('editor insertion and backward deletion preserve grapheme boundaries', () => {
  fc.assert(fc.property(fc.array(fc.constantFrom('a', 'é', 'e\u0301', '👩‍💻', '🇨🇴', '\n'), { maxLength: 100 }), parts => {
    const editor = new Editor();
    expect(editor.insert(parts.join(''))).toBe(true);
    expect(editor.text).toBe(parts.join(''));
    const graphemes = editor.parts;
    editor.key('backspace');
    expect(editor.text).toBe(graphemes.slice(0, -1).join(''));
    expect(editor.cursor).toBe(Math.max(0, graphemes.length - 1));
  }), parameters);
});

test('terminal text normalization is idempotent', () => {
  fc.assert(fc.property(fc.string(), value => {
    expect(plainText(plainText(value))).toBe(plainText(value));
  }), parameters);
});

test('routing context stays bounded and ignores nontext fields', () => {
  fc.assert(fc.property(fc.array(fc.record({ role: fc.constantFrom('user', 'assistant'), text: fc.string({ maxLength: 16000 }) }), { maxLength: 20 }), messages => {
    const context = routingContext(messages.map(message => ({ ...message, secret: 'PRIVATE_TOOL_PAYLOAD' })));
    expect(context.length).toBeLessThanOrEqual(12000);
    expect(context).toBe(routingContext(messages.slice(-8)));
    expect(context).not.toContain('PRIVATE_TOOL_PAYLOAD');
  }), parameters);
});

test('launched harnesses never inherit the routing credential', () => {
  fc.assert(fc.property(fc.string(), fc.constantFrom('codex', 'claude', 'opencode'), (secret, harness) => {
    const env = taskEnvironment(harness, { model: 'provider/model' }, { TYPESAFE_API_KEY: secret }, { TYPESAFE_API_KEY: secret, PATH: '/bin' });
    expect(env).not.toHaveProperty('TYPESAFE_API_KEY');
    expect(env.PATH).toBe('/bin');
  }), parameters);
});
