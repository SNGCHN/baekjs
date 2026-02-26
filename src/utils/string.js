import path from 'path';

export function formatNumber(n) {
  return Number(n).toLocaleString();
}

export function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function getVisualWidth(str) {
  const clean = stripAnsi(str);
  let width = 0;
  for (const char of clean) {
    const code = char.codePointAt(0);
    if (
      (code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0x303E) ||
      (code >= 0x3040 && code <= 0x33BF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x4E00 && code <= 0xA4CF) ||
      (code >= 0xAC00 && code <= 0xD7AF) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE30 && code <= 0xFE4F) ||
      (code >= 0xFF01 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      (code >= 0x20000 && code <= 0x2FA1F)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

export function padEndVisual(str, targetWidth) {
  const padding = Math.max(0, targetWidth - getVisualWidth(str));
  return str + ' '.repeat(padding);
}

export function padStartVisual(str, targetWidth) {
  const padding = Math.max(0, targetWidth - getVisualWidth(str));
  return ' '.repeat(padding) + str;
}

export function sliceVisual(str, maxWidth) {
  let width = 0;
  let i = 0;
  for (const char of str) {
    const cw = getVisualWidth(char);
    if (width + cw > maxWidth) break;
    width += cw;
    i += char.length;
  }
  return str.slice(0, i);
}

export function formatPath(fullPath) {
  let display = path.relative(process.cwd(), fullPath);
  if (display.startsWith('..')) display = fullPath;
  if (display.includes(' ')) display = `"${display}"`;
  return display;
}
