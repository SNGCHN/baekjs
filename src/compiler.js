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

function buildFunctionInvokeRuntime(solutionRef = 'solution') {
  return [
    `const __sol = ${solutionRef};`,
    "if (typeof __sol !== 'function') {",
    "  throw new Error('solution function is required.');",
    '}',
    'const __nativeLog = console.log.bind(console);',
    'let __didPrint = false;',
    'console.log = (...args) => {',
    '  __didPrint = true;',
    '  __nativeLog(...args);',
    '};',
    'const __hasMultiLineInput = /[\\r\\n]/.test(input);',
    'const __tokens = input.length ? input.split(/\\s+/) : [];',
    "const __autoCast = (v) => (/^[-+]?\\d+(?:\\.\\d+)?$/.test(v) ? Number(v) : v);",
    'const __arity = Number(__sol.length) || 0;',
    "if (__arity > 1 && __hasMultiLineInput) {",
    "  throw new Error('Multi-parameter mode supports single-line input only. Use solution(input) for complex input.');",
    '}',
    'const __args = __arity <= 1 ? [input] : __tokens.slice(0, __arity).map(__autoCast);',
    'const __print = (value) => {',
    '  if (__didPrint) return;',
    '  if (value === undefined) return;',
    "  if (Array.isArray(value)) console.log(value.join('\\n'));",
    "  else if (value && typeof value === 'object') console.log(JSON.stringify(value));",
    '  else console.log(String(value));',
    '};',
    'const __ret = __sol(...__args);',
    "if (__ret && typeof __ret.then === 'function') {",
    '  __ret.then(__print).catch((err) => { throw err; });',
    '} else {',
    '  __print(__ret);',
    '}',
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
      buildFunctionInvokeRuntime('module.exports'),
      ''
    ].join('\n');
  }

  return [
    trimmed,
    '',
    buildFunctionInvokeRuntime('solution'),
    ''
  ].join('\n');
}

export function compileSubmission({ sourceCode, ioMode }) {
  const normalizedIoMode = ioMode === 'fs' ? 'fs' : 'readline';
  const runtimeCode = buildFunctionRuntime(sourceCode);

  if (normalizedIoMode === 'fs') {
    return `${buildFsPrelude()}${runtimeCode}`;
  }

  return buildReadlinePrelude(runtimeCode);
}
