import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ensureConfigInteractive, getProjectRoot, getProblemFilePath, isValidProblemId } from '../config.js';
import { compileSubmission } from '../compiler.js';

function defaultOutputPath(problemId, cwd = process.cwd()) {
  return path.join(cwd, 'convert', `${problemId}.js`);
}

export async function exportProblem(problemId, options = {}) {
  if (!isValidProblemId(problemId)) {
    console.error(chalk.red('잘못된 문제 번호입니다. 숫자만 입력하세요. 예시: bjs export 1000'));
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
  const compiled = compileSubmission({
    sourceCode,
    ioMode: config.ioMode
  });

  if (options.print) {
    process.stdout.write(`${compiled}\n`);
    return;
  }

  const outPath = options.out
    ? path.resolve(process.cwd(), options.out)
    : defaultOutputPath(problemId, projectRoot);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, compiled, 'utf-8');

  if (projectRoot !== process.cwd()) {
    console.log(chalk.blue(`프로젝트 루트: ${projectRoot}`));
  }

  let displayPath = path.relative(process.cwd(), outPath);
  if (displayPath.startsWith('..')) {
    displayPath = outPath;
  }
  if (displayPath.includes(' ')) {
    displayPath = `"${displayPath}"`;
  }

  console.log(chalk.green(`변환 완료: ${displayPath}`));
  console.log(chalk.cyan('팁: --print 옵션으로 터미널에 직접 출력할 수 있습니다.'));
}
