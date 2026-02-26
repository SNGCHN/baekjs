import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import chalk from 'chalk';
import { ensureConfigInteractive, getProjectRoot, getProblemFilePath, isValidProblemId } from '../config.js';
import { compileSubmission } from '../compiler.js';
import { getSamples, ProviderError } from '../boj.js';

function normalizeOutput(value) {
  return value.replace(/\r\n/g, '\n').trimEnd();
}

function getGlobalCacheDir() {
  if (process.platform === 'win32') {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'baekjs', 'cache');
  }

  return path.join(os.homedir(), '.cache', 'baekjs');
}

function getCacheFilePath(problemId) {
  return path.join(getGlobalCacheDir(), `${problemId}.samples.json`);
}

function ensureCacheDir() {
  fs.mkdirSync(getGlobalCacheDir(), { recursive: true });
}

function loadSamplesFromCache(problemId) {
  const cachePath = getCacheFilePath(problemId);
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  const samples = Array.isArray(raw?.samples) ? raw.samples : null;
  if (!samples || samples.length === 0) {
    return null;
  }

  return samples;
}

function saveSamplesToCache(problemId, samples) {
  ensureCacheDir();
  const cachePath = getCacheFilePath(problemId);
  const payload = {
    problemId,
    savedAt: new Date().toISOString(),
    samples
  };
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function parseSamplesJson(value) {
  const parsed = JSON.parse(value.replace(/^\uFEFF/, ''));
  const items = Array.isArray(parsed) ? parsed : parsed?.samples;

  if (!Array.isArray(items)) {
    throw new Error('JSON은 배열이거나 { samples: [...] } 형식이어야 합니다.');
  }

  return items
    .map((item, idx) => ({
      id: Number(item.id ?? idx + 1),
      input: String(item.input ?? ''),
      output: String(item.output ?? '')
    }))
    .filter((item) => item.input.length > 0);
}

function loadSamplesFromFile(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`파일을 찾을 수 없습니다: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, 'utf-8');
  return parseSamplesJson(raw);
}

async function resolveSamples(problemId, options = {}) {
  if (options.fromFile) {
    const samples = loadSamplesFromFile(options.fromFile);
    return { samples, source: 'file' };
  }

  if (options.fromCache) {
    const cached = loadSamplesFromCache(problemId);
    if (!cached) {
      throw new Error(
        `${problemId}번 문제의 캐시가 없습니다. --from-cache 없이 먼저 실행하세요.`
      );
    }
    return { samples: cached, source: 'cache' };
  }

  try {
    const samples = await getSamples(problemId);
    saveSamplesToCache(problemId, samples);
    return { samples, source: 'network' };
  } catch (error) {
    const cached = loadSamplesFromCache(problemId);
    if (cached) {
      console.log(
        chalk.yellow(
          `서버 요청 실패 (${error.code || 'UNKNOWN'}). ${problemId}번 캐시로 대체합니다.`
        )
      );
      return { samples: cached, source: 'cache-fallback' };
    }
    throw error;
  }
}

function executeCase(compiledCode, inputText, timeoutMs) {
  return spawnSync(process.execPath, ['-e', compiledCode], {
    input: inputText,
    encoding: 'utf8',
    timeout: timeoutMs
  });
}

export async function testProblem(problemId, options = {}) {
  if (!isValidProblemId(problemId)) {
    console.error(chalk.red('잘못된 문제 번호입니다. 숫자만 입력하세요. 예시: bjs test 1000'));
    process.exitCode = 1;
    return;
  }

  const projectRoot = getProjectRoot(process.cwd());
  const config = await ensureConfigInteractive(projectRoot);
  const sourcePath = getProblemFilePath(problemId, projectRoot);

  if (!fs.existsSync(sourcePath)) {
    console.error(chalk.red(`문제 파일을 찾을 수 없습니다: problem/${problemId}.js`));
    console.error(chalk.yellow(`다음 명령으로 생성하세요: bjs create ${problemId}`));
    process.exitCode = 1;
    return;
  }

  const sourceCode = fs.readFileSync(sourcePath, 'utf-8');
  const compiledCode = compileSubmission({
    sourceCode,
    ioMode: config.ioMode
  });

  let samplesBundle;
  try {
    samplesBundle = await resolveSamples(problemId, options);
  } catch (error) {
    if (error instanceof ProviderError) {
      console.error(chalk.red(`[${error.code}] ${error.message}`));
    } else {
      console.error(chalk.red(error.message));
    }
    process.exitCode = 1;
    return;
  }

  const samples = samplesBundle.samples;
  if (!samples.length) {
    console.error(chalk.red('예제를 찾을 수 없습니다.'));
    process.exitCode = 1;
    return;
  }

  if (projectRoot !== process.cwd()) {
    console.log(chalk.blue(`프로젝트 루트: ${projectRoot}`));
  }
  console.log(chalk.blue(`${samplesBundle.source}에서 ${samples.length}개의 예제를 불러왔습니다.`));

  let passCount = 0;
  const timeoutMs = config.runner?.timeoutMs || 2000;

  for (const sample of samples) {
    if (sample !== samples[0]) {
      console.log(chalk.dim('  ─────────────────────────────'));
    }
    const result = executeCase(compiledCode, sample.input, timeoutMs);

    if (result.error) {
      console.log(chalk.red(`케이스 #${sample.id}: 오류 (${result.error.message})`));
      continue;
    }

    if (result.status !== 0) {
      console.log(chalk.red(`케이스 #${sample.id}: 오류 (종료코드=${result.status})`));
      if (result.stderr) {
        console.log(result.stderr.trim());
      }
      continue;
    }

    const expected = normalizeOutput(sample.output);
    const actual = normalizeOutput(result.stdout || '');

    if (actual === expected) {
      passCount += 1;
      console.log(chalk.green(`케이스 #${sample.id}: 통과`));
    } else {
      console.log(chalk.red(`케이스 #${sample.id}: 실패`));
      console.log(chalk.yellow('기대값:'));
      console.log(expected);
      console.log(chalk.yellow('실제값:'));
      console.log(actual);
    }
  }

  if (passCount === samples.length) {
    console.log(chalk.green(`\n통과 ${passCount}/${samples.length}`));
    return;
  }

  console.log(chalk.red(`\n실패 ${passCount}/${samples.length}`));
  process.exitCode = 1;
}
