export function enterAltBuffer() {
  process.stdout.write('\x1b[?1049h\x1b[?1000h\x1b[?1006h');
}

export function leaveAltBuffer() {
  process.stdout.write('\x1b[?1006l\x1b[?1000l\x1b[?1049l');
}

export function hideCursor() {
  process.stdout.write('\x1b[?25l');
}

export function showCursor() {
  process.stdout.write('\x1b[?25h');
}

export function clearAndRender(output) {
  process.stdout.write(`\x1b[H\x1b[2J${output}`);
}
