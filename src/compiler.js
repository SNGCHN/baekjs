function indentBlock(code, spaces = 2) {
  const pad = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.length > 0 ? `${pad}${line}` : line))
    .join('\n');
}

function buildFsPrelude() {
  return [
    "const fs = require('fs');",
    "const input = fs.readFileSync(0, 'utf8').trim();",
    ''
  ].join('\n');
}

function buildReadlinePrelude(userCode) {
  const indentedCode = indentBlock(userCode, 2);
  return [
    "const readline = require('readline');",
    "const rl = readline.createInterface({ input: process.stdin, output: process.stdout });",
    'const __lines = [];',
    "rl.on('line', (line) => __lines.push(line));",
    "rl.on('close', () => {",
    "  const input = __lines.join('\\n').trim();",
    indentedCode,
    '});',
    ''
  ].join('\n');
}

function buildFunctionRuntime(sourceCode) {
  const trimmed = sourceCode.trim();
  const usesModuleExports = /module\.exports\s*=/.test(trimmed);

  if (usesModuleExports) {
    return [
      'const module = { exports: {} };',
      'const exports = module.exports;',
      trimmed,
      '',
      'const __sol = module.exports;',
      "if (typeof __sol !== 'function') {",
      "  throw new Error('module.exports에 함수를 할당하세요.');",
      '}',
      '__sol(input);',
      ''
    ].join('\n');
  }

  return [
    trimmed,
    '',
    "if (typeof solution !== 'function') {",
    "  throw new Error('function solution(input) { ... } 형태로 작성하세요.');",
    '}',
    'solution(input);',
    ''
  ].join('\n');
}

function buildGlobalRuntime(sourceCode) {
  return `${sourceCode.trim()}\n`;
}

export function compileSubmission({ sourceCode, templateStyle, ioMode }) {
  const normalizedStyle = templateStyle === 'global' ? 'global' : 'function';
  const normalizedIoMode = ioMode === 'fs' ? 'fs' : 'readline';
  const runtimeCode =
    normalizedStyle === 'function'
      ? buildFunctionRuntime(sourceCode)
      : buildGlobalRuntime(sourceCode);

  if (normalizedIoMode === 'fs') {
    return `${buildFsPrelude()}${runtimeCode}`;
  }

  return buildReadlinePrelude(runtimeCode);
}

