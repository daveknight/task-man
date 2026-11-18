/**
 * Markdown list auto-format for the description editor. Typing `- `, `* ` or `1. ` at the start of a
 * line makes a list; Enter continues it; Enter on an empty item ends it; Tab and Shift+Tab indent.
 */

export interface TextEdit {
  value: string;
  /** Caret position after the edit. */
  caret: number;
}

const ITEM = /^(\s*)([-*]|\d+\.)(\s+)(.*)$/;
const INDENT = '  ';

function lineAt(value: string, caret: number) {
  const start = value.lastIndexOf('\n', caret - 1) + 1;
  const endIndex = value.indexOf('\n', caret);
  const end = endIndex === -1 ? value.length : endIndex;
  return { start, end, text: value.slice(start, end) };
}

/** Enter: continues a list item, or ends the list on an empty one. Null when Enter should behave normally. */
export function listEnter(value: string, caret: number): TextEdit | null {
  const line = lineAt(value, caret);
  const match = ITEM.exec(line.text);
  if (!match) return null;
  const [, indent = '', marker = '', space = ' ', content = ''] = match;
  if (content.trim() === '' && caret === line.end) {
    const next = value.slice(0, line.start) + value.slice(line.end);
    return { value: next, caret: line.start };
  }
  const numbered = /^(\d+)\.$/.exec(marker);
  const nextMarker = numbered ? `${Number(numbered[1]) + 1}.` : marker;
  const insert = `\n${indent}${nextMarker}${space}`;
  return { value: value.slice(0, caret) + insert + value.slice(caret), caret: caret + insert.length };
}

/** Tab or Shift+Tab on a list item: indents or outdents it. Null when the line isn't a list item. */
export function listIndent(value: string, caret: number, outdent: boolean): TextEdit | null {
  const line = lineAt(value, caret);
  if (!ITEM.test(line.text)) return null;
  if (outdent) {
    const remove = line.text.startsWith(INDENT) ? INDENT.length : line.text.startsWith('\t') || line.text.startsWith(' ') ? 1 : 0;
    if (remove === 0) return { value, caret };
    return { value: value.slice(0, line.start) + value.slice(line.start + remove), caret: Math.max(line.start, caret - remove) };
  }
  return { value: value.slice(0, line.start) + INDENT + value.slice(line.start), caret: caret + INDENT.length };
}
