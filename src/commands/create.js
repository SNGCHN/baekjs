import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ensureConfigInteractive, getProjectRoot, isValidProblemId } from '../config.js';

export async function createProblem(problemId) {
  if (!isValidProblemId(problemId)) {
    console.log(chalk.red('Invalid problemId. Use digits only. Example: bj create 1000'));
    return;
  }

  const projectRoot = getProjectRoot(process.cwd());
  const problemDir = path.join(projectRoot, 'problem');

  if (!fs.existsSync(problemDir)) {
    fs.mkdirSync(problemDir, { recursive: true });
  }

  const filePath = path.join(problemDir, `${problemId}.js`);

  if (fs.existsSync(filePath)) {
    console.log(chalk.red(`Error: File ${problemId}.js already exists.`));
    return;
  }

  // 최초 실행이면 여기서 즉시 설정을 생성/선택
  const config = await ensureConfigInteractive(projectRoot);
  const style = config.templateStyle || 'function';
  
  // 템플릿 파일 이름 확인
  const templateFileName = style === 'function' ? 'function.js' : 'global.js';
  const templatePath = new URL(`../templates/${templateFileName}`, import.meta.url);

  try {
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    fs.writeFileSync(filePath, templateContent, 'utf-8');
    if (projectRoot !== process.cwd()) {
      console.log(chalk.blue(`Using project root: ${projectRoot}`));
    }
    console.log(chalk.green(`Created file: problem/${problemId}.js (template: ${style})`));
  } catch (error) {
    console.error(chalk.red(`Failed to generate template from ${templateFileName}.`), error.message);
  }
}
