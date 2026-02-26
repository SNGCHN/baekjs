import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ensureConfigInteractive, getProjectRoot, isValidProblemId } from '../config.js';

export async function createProblem(problemId) {
  if (!isValidProblemId(problemId)) {
    console.log(chalk.red('Invalid problemId. Use digits only. Example: bjs create 1000'));
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

  await ensureConfigInteractive(projectRoot);

  const templatePath = new URL('../templates/function.js', import.meta.url);

  try {
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    fs.writeFileSync(filePath, templateContent, 'utf-8');
    if (projectRoot !== process.cwd()) {
      console.log(chalk.blue(`Using project root: ${projectRoot}`));
    }
    console.log(chalk.green(`Created file: problem/${problemId}.js`));
  } catch (error) {
    console.error(chalk.red('Failed to generate template.'), error.message);
  }
}
