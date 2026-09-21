import { stripVTControlCharacters } from 'node:util';

/** @param {unknown} value */
export function plainText(value) {
  // Terminal input intentionally strips C0/C1 controls while preserving line breaks.
  // oxlint-disable-next-line no-control-regex
  return stripVTControlCharacters(String(value ?? '')).replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '').replace(/\t/g, '  ');
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** @param {string} text */
const split = text => [...segmenter.segment(text)].map(item => item.segment);

export class Editor {
  constructor() { this.text = ''; this.cursor = 0; this.history = /** @type {string[]} */ ([]); this.index = 0; this.draft = ''; }
  get parts() { return split(this.text); }
  /** @param {string} text */
  set(text) { this.text = plainText(text); this.cursor = this.parts.length; }
  /** @param {string} text */
  insert(text) {
    const parts = this.parts;
    const before = parts.slice(0, this.cursor).join('') + plainText(text);
    const value = before + parts.slice(this.cursor).join('');
    if (Buffer.byteLength(value) > 48000) return false;
    this.text = value;
    this.cursor = split(before).length;
    return true;
  }
  /** @param {string} name */
  key(name) {
    const parts = this.parts;
    if (name === 'left') this.cursor = Math.max(0, this.cursor - 1);
    else if (name === 'right') this.cursor = Math.min(parts.length, this.cursor + 1);
    else if (name === 'home' || name === 'C-a') this.cursor = 0;
    else if (name === 'end' || name === 'C-e') this.cursor = parts.length;
    else if (name === 'backspace' && this.cursor) { parts.splice(--this.cursor, 1); this.text = parts.join(''); }
    else if (name === 'delete') { parts.splice(this.cursor, 1); this.text = parts.join(''); }
    else if (name === 'C-u') { this.text = parts.slice(this.cursor).join(''); this.cursor = 0; }
    else if (name === 'C-k') this.text = parts.slice(0, this.cursor).join('');
    else if (name === 'C-w') {
      const before = parts.slice(0, this.cursor).join('').replace(/\s*\S+\s*$/, '');
      this.text = before + parts.slice(this.cursor).join('');
      this.cursor = split(before).length;
    } else if (name === 'up' || name === 'down') {
      if (this.index === this.history.length) this.draft = this.text;
      this.index = Math.max(0, Math.min(this.history.length, this.index + (name === 'up' ? -1 : 1)));
      this.set(this.index === this.history.length ? this.draft : this.history[this.index]);
    }
  }
  submit() {
    const value = this.text;
    if (value.trim() && this.history.at(-1) !== value) this.history.push(value);
    this.history = this.history.slice(-100);
    this.index = this.history.length;
    this.set(''); this.draft = '';
    return value;
  }
}
