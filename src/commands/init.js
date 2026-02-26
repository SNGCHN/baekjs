import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import {
  ensureConfigInteractive,
  getConfigPath,
  loadConfig,
  getProjectRoot
} from '../config.js';

export async function initProject() {
  const projectRoot = getProjectRoot(process.cwd());
  const configPath = getConfigPath(projectRoot);
  const hasConfig = fs.existsSync(configPath);
  const config = await ensureConfigInteractive(projectRoot);
  const style = config.templateStyle;

  if (hasConfig) {
    console.log(chalk.yellow('baekjs.config.json already exists. Keeping current settings.'));
  } else {
    console.log(chalk.green('Created baekjs.config.json'));
  }

  const problemDir = path.join(projectRoot, 'problem');
  if (!fs.existsSync(problemDir)) {
    fs.mkdirSync(problemDir, { recursive: true });
  }

  const examplePath = path.join(problemDir, '1000.js');
  if (fs.existsSync(examplePath)) {
    console.log(chalk.yellow('problem/1000.js already exists. Skipping example creation.'));
  } else {
    const templateFileName = style === 'function' ? 'function.js' : 'global.js';
    const templatePath = new URL(`../templates/${templateFileName}`, import.meta.url);

    try {
      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      fs.writeFileSync(examplePath, templateContent, 'utf-8');
      console.log(chalk.green('Created example file: problem/1000.js'));
    } catch (e) {
      console.log(chalk.red('Failed to read template content.'), e.message);
    }
  }

  const latest = loadConfig(projectRoot);
  console.log(chalk.blue('\nInitialization complete.'));
  if (projectRoot !== process.cwd()) {
    console.log(chalk.blue(`Using project root: ${projectRoot}`));
  }
  console.log(
    `templateStyle=${latest.templateStyle}, ioMode=${latest.ioMode}, provider=${latest.provider}`
  );
  console.log('Next:', chalk.cyan('bj create 1001'));
}
