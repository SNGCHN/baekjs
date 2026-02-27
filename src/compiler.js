function normalizeSource(code) {
  return code.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function validateSource(code) {
  const stripped = stripComments(code);
  const hasSolution =
    /\b(?:async\s+)?function\s+solution\s*\(/.test(stripped) ||
    /\b(?:const|let|var)\s+solution\s*=/.test(stripped);

  if (!hasSolution) {
    throw new Error(
      'solution 함수를 찾을 수 없습니다. const solution = (input) => { }; 형태로 작성해주세요.'
    );
  }
}

function buildPrintBlock(indent = '') {
  return [
    `${indent}const __result = solution(input);`,
    `${indent}if (__result !== undefined) {`,
    `${indent}  if (Array.isArray(__result)) console.log(__result.join('\\n'));`,
    `${indent}  else console.log(String(__result));`,
    `${indent}}`
  ].join('\n');
}

function indentBlock(code, spaces = 2) {
  const pad = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.length > 0 ? `${pad}${line}` : line))
    .join('\n');
}

function buildFsCode(sourceCode) {
  return [
    "const fs = require('fs');",
    "const input = fs.readFileSync('/dev/stdin').toString().trim();",
    '',
    sourceCode,
    '',
    buildPrintBlock()
  ].join('\n');
}

function buildReadlineCode(sourceCode) {
  return [
    'const readline = require("readline");',
    'const rl = readline.createInterface({ input: process.stdin, output: process.stdout });',
    'const __lines = [];',
    'rl.on("line", (line) => __lines.push(line));',
    'rl.on("close", () => {',
    "  const input = __lines.join('\\n').trim();",
    '',
    indentBlock(sourceCode),
    '',
    buildPrintBlock('  '),
    '  process.exit();',
    '});'
  ].join('\n');
}

export function compileSubmission({ sourceCode, ioMode }) {
  const normalized = normalizeSource(sourceCode).trim();
  validateSource(normalized);

  if (ioMode === 'fs') {
    return buildFsCode(normalized);
  }
  return buildReadlineCode(normalized);
}
