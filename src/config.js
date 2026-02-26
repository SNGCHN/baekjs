import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline/promises';

/* ── project root ─────────────────────────────────────── */

const CONFIG_FILE_NAME = 'baekjs.config.json';

function hasConfig(dir) {
  return fs.existsSync(path.join(dir, CONFIG_FILE_NAME));
}

export function resolveProjectRoot(startDir = process.cwd()) {
  const absoluteStart = path.resolve(startDir);

  let cursor = absoluteStart;
  while (true) {
    if (hasConfig(cursor)) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  return absoluteStart;
}

export function getProjectRoot(cwd = process.cwd()) {
  return resolveProjectRoot(cwd);
}

/* ── config ────────────────────────────────────────────── */

export const DEFAULT_CONFIG = {
  configVersion: 1,
  templateStyle: 'function',
  ioMode: 'readline',
  provider: 'boj',
  user: { handle: '' },
  runner: { timeoutMs: 2000 }
};

export function getConfigPath(cwd = process.cwd()) {
  return path.join(resolveProjectRoot(cwd), CONFIG_FILE_NAME);
}

export function loadConfig(cwd = process.cwd()) {
  const projectRoot = resolveProjectRoot(cwd);
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG, runner: { ...DEFAULT_CONFIG.runner } };
  }

  try {
    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return migrateConfig(rawConfig);
  } catch (error) {
    console.error(`Failed to parse ${CONFIG_FILE_NAME}. Using default config. (${error.message})`);
    return { ...DEFAULT_CONFIG, runner: { ...DEFAULT_CONFIG.runner } };
  }
}

export function migrateConfig(config) {
  let migrated = { ...config };
  if (!migrated.configVersion) migrated.configVersion = 1;
  migrated.templateStyle = (migrated.templateStyle === 'function' || migrated.templateStyle === 'global')
    ? migrated.templateStyle : DEFAULT_CONFIG.templateStyle;
  migrated.ioMode = (migrated.ioMode === 'readline' || migrated.ioMode === 'fs')
    ? migrated.ioMode : DEFAULT_CONFIG.ioMode;
  migrated.provider = migrated.provider || DEFAULT_CONFIG.provider;
  migrated.user = { ...DEFAULT_CONFIG.user, ...(migrated.user || {}) };
  if (typeof migrated.user.handle !== 'string') migrated.user.handle = DEFAULT_CONFIG.user.handle;
  migrated.runner = { ...DEFAULT_CONFIG.runner, ...(migrated.runner || {}) };
  return migrated;
}

export function saveConfig(config, cwd = process.cwd()) {
  const projectRoot = resolveProjectRoot(cwd);
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  fs.writeFileSync(configPath, JSON.stringify(migrateConfig(config), null, 2), 'utf-8');
  return configPath;
}

export async function ensureConfigInteractive(cwd = process.cwd()) {
  const projectRoot = resolveProjectRoot(cwd);
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  if (fs.existsSync(configPath)) return loadConfig(projectRoot);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    saveConfig(DEFAULT_CONFIG, projectRoot);
    return loadConfig(projectRoot);
  }

  const setupConfig = await promptInitialConfig();
  saveConfig(setupConfig, projectRoot);
  return loadConfig(projectRoot);
}

async function promptInitialConfig() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('First-time setup for baekjs');

    const templateStyle = await askChoice(rl, '코드 작성 스타일을 선택하세요', [
      { key: '1', value: 'function', label: 'Function (Recommended)' },
      { key: '2', value: 'global', label: 'Global' }
    ], '1');

    const ioMode = await askChoice(rl, '입력 어댑터를 선택하세요', [
      { key: '1', value: 'readline', label: 'readline (Recommended)' },
      { key: '2', value: 'fs', label: 'fs' }
    ], '1');

    return migrateConfig({ ...DEFAULT_CONFIG, templateStyle, ioMode });
  } finally {
    rl.close();
  }
}

async function askChoice(rl, title, options, defaultKey) {
  console.log(`\n${title}`);
  for (const option of options) console.log(`  ${option.key}) ${option.label}`);
  const rawAnswer = await rl.question(`선택 [${defaultKey}]: `);
  const answer = (rawAnswer || defaultKey).trim();
  const selected = options.find((o) => o.key === answer);
  return selected ? selected.value : options.find((o) => o.key === defaultKey).value;
}

/* ── problem helpers ──────────────────────────────────── */

export function isValidProblemId(problemId) {
  return typeof problemId === 'string' && /^\d+$/.test(problemId);
}

export function getProblemFilePath(problemId, cwd = process.cwd()) {
  return path.join(resolveProjectRoot(cwd), 'problem', `${problemId}.js`);
}

export function ensureProblemFile(problemId, { projectRoot, templateStyle }) {
  const problemDir = path.join(projectRoot, 'problem');
  if (!fs.existsSync(problemDir)) fs.mkdirSync(problemDir, { recursive: true });

  const filePath = path.join(problemDir, `${problemId}.js`);
  if (fs.existsSync(filePath)) return { created: false, filePath };

  const templateFileName = templateStyle === 'global' ? 'global.js' : 'function.js';
  const templatePath = new URL(`./templates/${templateFileName}`, import.meta.url);
  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  fs.writeFileSync(filePath, templateContent, 'utf-8');
  return { created: true, filePath };
}
