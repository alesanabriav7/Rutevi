import { PassThrough } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

const start = '\x1b[200~';
const end = '\x1b[201~';
/** @param {string} text @param {string} delimiter */
function suffixLength(text, delimiter) {
  for (let length = delimiter.length - 1; length > 0; length--) if (text.endsWith(delimiter.slice(0, length))) return length;
  return 0;
}

// Keep bracketed pastes atomic even when terminal writes split the delimiters.
// Only normal keystrokes/mouse events reach Blessed's legacy key decoder.
/** @param {NodeJS.ReadStream} source @param {(text: string|null) => void} onPaste */
export function terminalInput(source, onPaste) {
  const input = Object.assign(new PassThrough(), {
    isTTY: source.isTTY,
    isRaw: false,
    /** @param {boolean} enabled */
    setRawMode(enabled) { source.setRawMode?.(enabled); this.isRaw = enabled; },
  });
  const decoder = new StringDecoder('utf8');
  let pending = '', paste = '', pasting = false, overflow = false;
  /** @type {NodeJS.Timeout|undefined} */
  let escapeTimer;
  /** @param {string} text */
  const append = text => {
    if (overflow) return;
    paste += text;
    if (Buffer.byteLength(paste) > 48000) { paste = ''; overflow = true; }
  };
  /** @param {Buffer|string} bytes */
  const onData = bytes => {
    clearTimeout(escapeTimer);
    pending += typeof bytes === 'string' ? bytes : decoder.write(bytes);
    while (pending) {
      const delimiter = pasting ? end : start;
      const position = pending.indexOf(delimiter);
      if (position >= 0) {
        const text = pending.slice(0, position);
        pending = pending.slice(position + delimiter.length);
        if (pasting) { append(text); onPaste(overflow ? null : paste); paste = ''; overflow = false; }
        else if (text) input.write(text);
        pasting = !pasting;
      } else {
        const retained = suffixLength(pending, delimiter);
        const text = pending.slice(0, pending.length - retained);
        pending = pending.slice(pending.length - retained);
        if (pasting) append(text);
        else if (text) input.write(text);
        // A standalone Escape must remain usable. Longer CSI prefixes wait for completion.
        if (!pasting && pending === '\x1b') escapeTimer = setTimeout(() => { input.write(pending); pending = ''; }, 50);
        break;
      }
    }
  };
  source.on('data', onData);
  return {
    input,
    close() { clearTimeout(escapeTimer); source.removeListener('data', onData); source.pause(); input.destroy(); },
  };
}
