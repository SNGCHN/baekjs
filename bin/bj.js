#!/usr/bin/env node

import cac from 'cac';
import chalk from 'chalk';
import fs from 'fs';

import { initProject } from '../src/commands/init.js';
import { createProblem } from '../src/commands/create.js';
import { testProblem } from '../src/commands/test.js';
import { exportProblem } from '../src/commands/export.js';
import { runDashboard } from '../src/dashboard/index.js';

const cli = cac('bjs');

if (process.argv.slice(2).length === 0) {
  await runDashboard();
  process.exit(0);
}

cli
  .command('dashboard', 'Run interactive dashboard UI')
  .action(async () => {
    await runDashboard();
  });

cli
  .command('init', 'Optional setup command (first run is also auto-configured)')
  .action(async () => {
    await initProject();
  });

cli
  .command('create <problemId>', 'Create problem template file')
  .alias('new')
  .action(async (problemId) => {
    await createProblem(problemId);
  });

cli
  .command('test <problemId>', 'Run sample tests with PASS/FAIL')
  .option('--from-cache', 'Use cached samples only')
  .option('--from-file <path>', 'Load samples from local JSON file (higher priority)')
  .action(async (problemId, options) => {
    await testProblem(problemId, options);
  });

cli
  .command('export <problemId>', 'Compile source to BOJ submission code')
  .option('--print', 'Print compiled code to stdout')
  .option('--out <path>', 'Write compiled code to a file path')
  .action(async (problemId, options) => {
    await exportProblem(problemId, options);
  });

// package.json 버전 파싱 및 도움말
try {
  const packageJsonPath = new URL('../package.json', import.meta.url);
  const { version } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  cli.help();
  cli.version(version);
} catch (error) {
  cli.help();
  cli.version('unknown');
}

// 에러 핸들링
try {
  await cli.parse();
} catch (error) {
  console.error(chalk.red(`\nError: ${error.message}\n`));
  process.exit(1);
}
