import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { createInterface } from 'readline/promises';
import readline from 'readline';
import { ensureConfigInteractive, getProjectRoot, loadConfig, saveConfig, ensureProblemFile } from '../config.js';
import {
  getSourceCatalog,
  getTagCatalog,
  getProblemById,
  getUserClassProgress,
  getUserOverview,
  getSolvedProblemIds,
} from '../solvedac.js';
import { getProblemContent, getSamples } from '../boj.js';
import { testProblem } from '../commands/test.js';
import { exportProblem } from '../commands/export.js';

import { formatPath } from '../utils/string.js';
import { createSpinner, normalizeError, getMyMenus, BOTTOM_TABS } from './constants.js';
import { enterAltBuffer, leaveAltBuffer, hideCursor, showCursor } from './terminal.js';
import { renderScreen } from './renderer.js';
import { loadProblemListView, makeInitialView } from './views.js';
import { progressBar } from './constants.js';

/* ── prompt helpers ── */

async function promptText(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function ensureHandle(config, projectRoot, onBeforePrompt) {
  let handle = String(config.user?.handle || '').trim();

  if (handle) {
    try {
      await getUserOverview(handle);
    } catch (error) {
      if (onBeforePrompt) onBeforePrompt();
      console.log(chalk.yellow(`저장된 handle(${handle}) 검증 실패: ${normalizeError(error)}`));
      handle = '';
    }
  } else {
    if (onBeforePrompt) onBeforePrompt();
  }

  while (!handle) {
    handle = await promptText('새로운 아이디를 입력해주세요: ');
    if (!handle) continue;
    try {
      await getUserOverview(handle);
    } catch (error) {
      console.log(chalk.red(`핸들 확인 실패: ${normalizeError(error)}`));
      handle = '';
    }
  }

  if (handle !== config.user?.handle) {
    const nextConfig = {
      ...config,
      user: { ...(config.user || {}), handle }
    };
    saveConfig(nextConfig, projectRoot);
  }

  return handle;
}

/* ── main ── */

export async function runDashboard() {
  const projectRoot = getProjectRoot(process.cwd());

  /* ── boot spinner (normal terminal) ── */
  const BOOT_FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
  let bootIdx = 0;
  let bootTimer = null;
  const startBoot = () => {
    if (bootTimer) return;
    bootTimer = setInterval(() => {
      const frame = BOOT_FRAMES[bootIdx++ % BOOT_FRAMES.length];
      process.stdout.write(`\r  ${frame} ${chalk.dim('불러오는 중...')}`);
    }, 80);
  };
  const stopBoot = () => {
    if (!bootTimer) return;
    clearInterval(bootTimer);
    bootTimer = null;
    process.stdout.write('\r\x1b[2K');
  };

  const configExists = fs.existsSync(path.join(projectRoot, 'baekjs.config.json'));
  if (configExists) startBoot();

  await ensureConfigInteractive(projectRoot);
  let config = loadConfig(projectRoot);
  const handle = await ensureHandle(config, projectRoot, stopBoot);
  stopBoot();
  config = loadConfig(projectRoot);

  const state = {
    quit: false,
    busy: false,
    statusMessage: '',
    projectRoot,
    config,
    handle,
    bottomTabIndex: 0,
    viewStack: makeInitialView(0, handle),
    userOverview: null,
    classProgress: null,
    solvedIds: null,
    spinner: null,
    scrollOffset: 0,
    viewportHeight: 10
  };

  const reloadUserInfo = async () => {
    const [overviewResult, classResult, solvedIdsResult] = await Promise.allSettled([
      getUserOverview(state.handle),
      getUserClassProgress(state.handle),
      getSolvedProblemIds(state.handle)
    ]);

    if (overviewResult.status === 'rejected') {
      throw new Error(`유저 정보 로딩 실패: ${normalizeError(overviewResult.reason)}`);
    }
    state.userOverview = overviewResult.value;

    const warnings = [];

    if (classResult.status === 'fulfilled') {
      state.classProgress = classResult.value;
    } else {
      state.classProgress = [];
      warnings.push(`CLASS 진행도 로딩 실패: ${normalizeError(classResult.reason)}`);
    }

    if (solvedIdsResult.status === 'fulfilled') {
      state.solvedIds = solvedIdsResult.value;
    } else {
      state.solvedIds = new Set();
      warnings.push(`풀이 상태 로딩 실패: ${normalizeError(solvedIdsResult.reason)}`);
    }

    if (warnings.length > 0) {
      state.statusMessage = warnings.join(' | ');
    }
  };

  const refreshSolvedIds = async () => {
    state.solvedIds = await getSolvedProblemIds(state.handle);
  };

  /* ── render ── */

  const render = () => renderScreen(state);

  /* ── async helpers ── */

  const withBusy = async (fn) => {
    if (state.busy) return;
    state.busy = true;
    state.statusMessage = '';
    const busySpinner = createSpinner();
    state.spinner = busySpinner;
    render();
    busySpinner.start(() => render());
    try {
      await fn();
    } catch (error) {
      state.statusMessage = `Error: ${normalizeError(error)}`;
    } finally {
      busySpinner.stop();
      state.spinner = null;
      state.busy = false;
      render();
    }
  };

  let onKeypress;
  let onData;
  const attachKeyListener = () => {
    process.stdin.on('keypress', onKeypress);
    if (onData) process.stdin.on('data', onData);
  };
  const detachKeyListener = () => {
    process.stdin.off('keypress', onKeypress);
    if (onData) process.stdin.off('data', onData);
  };
  const suspendDashboardUi = () => {
    detachKeyListener();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    showCursor();
    leaveAltBuffer();
  };
  const resumeDashboardUi = () => {
    enterAltBuffer();
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    hideCursor();
    attachKeyListener();
    render();
  };
  const waitForAnyKey = async () => {
    await new Promise((resolve) => {
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('keypress', resolve);
    });
  };

  /* ── navigation ── */

  const openProblemDetail = async (problemId) => {
    const problem = await getProblemById(problemId);
    const { created, filePath } = ensureProblemFile(problemId, {
      projectRoot: state.projectRoot
    });

    let samples = [];
    let content = { description: '', input: '', output: '' };
    const loadErrors = [];

    const [samplesResult, contentResult] = await Promise.allSettled([
      getSamples(problemId),
      getProblemContent(problemId)
    ]);

    if (samplesResult.status === 'fulfilled') {
      samples = samplesResult.value;
    } else {
      loadErrors.push(`샘플 로딩 실패: ${normalizeError(samplesResult.reason)}`);
    }

    if (contentResult.status === 'fulfilled') {
      content = contentResult.value;
    } else {
      loadErrors.push(`문제 본문 로딩 실패: ${normalizeError(contentResult.reason)}`);
    }

    state.viewStack.push({
      type: 'problem-detail',
      problem,
      samples,
      content,
      filePath,
      index: 0,
      actions: [
        { id: 'test', label: '예제 테스트 실행 (t)' },
        { id: 'export', label: '코드 변환 [제출용] (e)' },
        { id: 'back', label: '목록으로 돌아가기 (Esc)' },
        { id: 'quit', label: '대시보드 종료 (q)' }
      ]
    });
    state.scrollOffset = 0;

    const displayPath = formatPath(filePath);
    const fileMessage = created
      ? `생성 완료: ${displayPath}`
      : `이미 존재하는 파일: ${displayPath}`;
    state.statusMessage = loadErrors.length
      ? `${fileMessage} | ${loadErrors.join(' | ')}`
      : fileMessage;
  };

  const openClassList = () => {
    const items = (state.classProgress || []).map((row) => {
      const classNum = `CLASS ${String(row.class).padStart(2)}`;
      const bar = progressBar(row.solved, row.total, 15);
      const count = chalk.white(`${row.solved}`) + chalk.gray(`/${row.total}`);
      return {
        id: row.class,
        label: `${classNum}  ${bar}  ${count}`
      };
    });

    state.viewStack.push({
      type: 'menu',
      menuId: 'class',
      title: 'Class Problems',
      description: 'solved.ac class 기반 · 선택하면 문제 목록을 불러옵니다.',
      index: 0,
      items
    });
    state.scrollOffset = 0;
  };

  const openSourceMenu = async () => {
    const sources = await getSourceCatalog();
    const items = sources.map((source) => ({
      id: source.query,
      label: source.label,
      query: source.query,
      listTitle: `문제 출처: ${source.query}`
    }));

    if (!items.length) {
      state.statusMessage = '문제 출처 목록을 가져오지 못했습니다.';
      return;
    }

    state.viewStack.push({
      type: 'menu',
      menuId: 'source',
      title: 'Problem Sources',
      description: '목록에서 출처를 선택하세요.',
      index: 0,
      items
    });
    state.scrollOffset = 0;
  };

  const openTagMenu = async () => {
    const tags = await getTagCatalog();
    const items = tags.map((tag) => ({
      id: tag.key,
      label: tag.label,
      query: tag.query,
      listTitle: `알고리즘 분류: ${tag.query}`
    }));

    if (!items.length) {
      state.statusMessage = '태그 목록을 가져오지 못했습니다.';
      return;
    }

    state.viewStack.push({
      type: 'menu',
      menuId: 'tag',
      title: 'Tag Categories',
      description: '목록에서 태그를 선택하세요.',
      index: 0,
      items
    });
    state.scrollOffset = 0;
  };

  const openRankMenu = () => {
    state.viewStack.push({
      type: 'menu',
      menuId: 'rank',
      title: 'Rank Filters',
      description: '필터를 선택하세요.',
      index: 0,
      items: getMyMenus(state.handle).map((x) => ({ ...x }))
    });
    state.scrollOffset = 0;
  };

  const handleMenuSelect = async (view, item) => {
    if (state.bottomTabIndex === 3 && item.id === 'quit') {
      state.quit = true;
      return;
    }

    if (state.bottomTabIndex === 0 && state.viewStack.length === 1) {
      if (item.id === 'all') {
        state.viewStack.push(
          await loadProblemListView({
            title: 'All Problems',
            query: '*',
            sort: 'id',
            direction: 'asc',
            page: 1
          })
        );
        state.scrollOffset = 0;
        return;
      }
      if (item.id === 'source') {
        await openSourceMenu();
        return;
      }
      if (item.id === 'class') {
        openClassList();
        return;
      }
      if (item.id === 'tag') {
        await openTagMenu();
        return;
      }
      if (item.id === 'recent') {
        state.viewStack.push(
          await loadProblemListView({
            title: 'Recent Problems',
            query: '*',
            sort: 'id',
            direction: 'desc',
            page: 1
          })
        );
        state.scrollOffset = 0;
        return;
      }
      if (item.id === 'rank') {
        openRankMenu();
        return;
      }
      return;
    }

    if (view.menuId === 'class') {
      state.viewStack.push(
        await loadProblemListView({
          title: 'Class Problems',
          query: `in_class:${item.id}`,
          sort: 'id',
          direction: 'asc',
          page: 1
        })
      );
      state.scrollOffset = 0;
      return;
    }

    if (view.menuId === 'source' || view.menuId === 'tag') {
      state.viewStack.push(
        await loadProblemListView({
          title: item.listTitle || item.label,
          query: item.query,
          sort: 'id',
          direction: 'asc',
          page: 1
        })
      );
      state.scrollOffset = 0;
      return;
    }

    if (view.menuId === 'rank' || state.bottomTabIndex === 1) {
      state.viewStack.push(
        await loadProblemListView({
          title: item.label,
          query: item.query,
          sort: item.sort || 'id',
          direction: item.direction || 'asc',
          page: 1
        })
      );
      state.scrollOffset = 0;
      return;
    }
  };

  const openPage = async (delta) => {
    const current = state.viewStack[state.viewStack.length - 1];
    if (!current || current.type !== 'problem-list') return;
    const nextPage = Math.max(1, current.page + delta);
    if (nextPage === current.page) return;

    const updated = await loadProblemListView({
      title: current.title,
      query: current.query,
      sort: current.sort,
      direction: current.direction,
      page: nextPage
    });
    state.viewStack[state.viewStack.length - 1] = updated;
    state.scrollOffset = 0;
  };

  const goBack = async () => {
    if (state.viewStack.length <= 1) {
      render();
      return;
    }

    const leavingView = state.viewStack[state.viewStack.length - 1];
    state.viewStack.pop();
    state.scrollOffset = 0;

    const nextView = state.viewStack[state.viewStack.length - 1];
    if (leavingView?.type === 'problem-detail' && nextView?.type === 'problem-list') {
      await withBusy(async () => {
        await refreshSolvedIds();
        state.statusMessage = '풀이 상태를 최신으로 갱신했습니다.';
      });
      return;
    }

    render();
  };

  /* ── keypress handler ── */

  onData = (buf) => {
    if (state.busy) return;
    const str = buf.toString();
    const matches = [...str.matchAll(/\x1b\[<(\d+);\d+;\d+[Mm]/g)];
    if (matches.length > 0) {
      let changed = false;
      for (const match of matches) {
        const btn = parseInt(match[1], 10);
        if (btn === 64) {
          state.scrollOffset = Math.max(0, state.scrollOffset - 1);
          changed = true;
        } else if (btn === 65) {
          state.scrollOffset += 1;
          changed = true;
        }
      }
      if (changed) render();
    }
  };

  onKeypress = async (str, key) => {
    try {
    if (key?.ctrl && key.name === 'c') {
      state.quit = true;
      return;
    }

    if (state.busy) {
      if (key?.name === 'q') state.quit = true;
      return;
    }

    if (key?.name === 'q') {
      state.quit = true;
      return;
    }

    if (key?.name === 'tab') {
      state.bottomTabIndex = (state.bottomTabIndex + 1) % BOTTOM_TABS.length;
      state.viewStack = makeInitialView(state.bottomTabIndex, state.handle);
      state.scrollOffset = 0;
      render();
      return;
    }

    const current = state.viewStack[state.viewStack.length - 1];
    if (!current) return;

    if (key?.name === 'escape' || key?.name === 'backspace') {
      await goBack();
      return;
    }

    if (key?.name === 'n') {
      await withBusy(async () => { await openPage(1); });
      return;
    }

    if (key?.name === 'p') {
      await withBusy(async () => { await openPage(-1); });
      return;
    }

    if (current.type === 'problem-detail' && !key?.ctrl) {
      if (key?.name === 't') {
        current.index = Math.max(0, current.actions.findIndex(a => a.id === 'test'));
        key.name = 'return';
      } else if (key?.name === 'e') {
        current.index = Math.max(0, current.actions.findIndex(a => a.id === 'export'));
        key.name = 'return';
      } else if (key?.name === 'j') {
        state.scrollOffset += 1;
        render();
        return;
      } else if (key?.name === 'k') {
        state.scrollOffset = Math.max(0, state.scrollOffset - 1);
        render();
        return;
      } else if (key?.name === 'g' || key?.name === 'home' || key?.name === 'end') {
        if (key?.shift || key?.name === 'end') state.scrollOffset = 999999;
        else state.scrollOffset = 0;
        render();
        return;
      }
    }

    if (key?.name === 'pageup') {
      const step = Math.max(1, (state.viewportHeight || 10) - 2);
      state.scrollOffset = Math.max(0, state.scrollOffset - step);
      render();
      return;
    }

    if (key?.name === 'pagedown') {
      const step = Math.max(1, (state.viewportHeight || 10) - 2);
      state.scrollOffset += step;
      render();
      return;
    }

    if (key?.name === 'up') {
      current.index = Math.max(0, current.index - 1);
      render();
      return;
    }

    if (key?.name === 'down') {
      const maxIndex = (current.type === 'problem-detail' || current.type === 'profile')
        ? current.actions.length - 1
        : (current.items?.length || 1) - 1;
      current.index = Math.min(maxIndex, current.index + 1);
      render();
      return;
    }

    if (key?.name === 'return') {
      if (current.type === 'profile') {
        const selectedAction = current.actions[current.index];
        if (!selectedAction) return;

        if (selectedAction.id === 'switch') {
          suspendDashboardUi();
          try {
            console.log(chalk.cyan('\n  계정 전환\n'));

            let newHandle = '';
            while (!newHandle) {
              newHandle = await promptText('새로운 아이디를 입력해주세요 (취소: 빈 칸 Enter): ');
              if (newHandle === '') {
                return;
              }
              try {
                await getUserOverview(newHandle);
              } catch (error) {
                console.log(chalk.red(`핸들 확인 실패: ${normalizeError(error)}`));
                newHandle = '';
              }
            }

            state.handle = newHandle;
            const nextConfig = {
              ...state.config,
              user: { ...(state.config.user || {}), handle: newHandle }
            };
            saveConfig(nextConfig, state.projectRoot);
            state.config = loadConfig(state.projectRoot);

            console.log(chalk.yellow('  정보를 다시 불러오는 중...'));
            await reloadUserInfo();

            state.viewStack = makeInitialView(state.bottomTabIndex, state.handle);
            state.scrollOffset = 0;
            state.statusMessage = `계정 전환 완료: ${newHandle}`;
          } catch (error) {
            state.statusMessage = `Error: ${normalizeError(error)}`;
          } finally {
            resumeDashboardUi();
          }
          return;
        }
      }

      if (current.type === 'problem-detail') {
        const selectedAction = current.actions[current.index];
        if (!selectedAction) return;

        if (selectedAction.id === 'back') {
          await goBack();
          return;
        }

        if (selectedAction.id === 'quit') {
          state.quit = true;
          return;
        }

        if (selectedAction.id === 'test' || selectedAction.id === 'export') {
          suspendDashboardUi();
          try {
            if (selectedAction.id === 'test') {
              console.log(chalk.cyan(`\n  예제 테스트: ${current.problem.problemId}\n`));
              await testProblem(String(current.problem.problemId));
            } else {
              console.log(chalk.cyan(`\n  코드 변환: ${current.problem.problemId}\n`));
              await exportProblem(String(current.problem.problemId));
            }
            console.log(chalk.dim('\n  아무 키나 누르면 대시보드로 돌아갑니다...'));
            await waitForAnyKey();
          } catch (error) {
            state.statusMessage = `Error: ${normalizeError(error)}`;
            console.error(chalk.red(`\nError: ${normalizeError(error)}\n`));
          } finally {
            resumeDashboardUi();
          }
          return;
        }
      }

      await withBusy(async () => {
        if (current.type === 'menu') {
          const selected = current.items[current.index];
          if (!selected) return;
          await handleMenuSelect(current, selected);
          return;
        }

        if (current.type === 'problem-list') {
          const selected = current.items[current.index];
          if (!selected) return;
          await openProblemDetail(selected.problemId);
          return;
        }

        if (current.type === 'profile') {
          const selectedAction = current.actions[current.index];
          if (!selectedAction) return;

          if (selectedAction.id === 'logout') {
            const nextConfig = {
              ...state.config,
              user: { ...(state.config.user || {}), handle: '' }
            };
            saveConfig(nextConfig, state.projectRoot);
            state.quit = true;
            state.statusMessage = '로그아웃 완료';
            return;
          }
          return;
        }
      });
    }
    } catch (error) {
      state.statusMessage = `Error: ${normalizeError(error)}`;
      render();
    }
  };

  /* ── start ── */

  const onResize = () => render();
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  enterAltBuffer();
  hideCursor();
  process.stdout.on('resize', onResize);

  const loadingSpinner = createSpinner();
  state.spinner = loadingSpinner;
  render();
  loadingSpinner.start(() => render());

  try {
    await reloadUserInfo();
  } catch (error) {
    loadingSpinner.stop();
    state.spinner = null;
    detachKeyListener();
    process.stdout.off('resize', onResize);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    showCursor();
    leaveAltBuffer();
    console.error(chalk.red(`\n  대시보드 시작 실패: ${normalizeError(error)}\n`));
    return;
  }

  loadingSpinner.stop();
  state.spinner = null;

  attachKeyListener();
  render();

  await new Promise((resolve) => {
    const interval = setInterval(() => {
      if (state.quit) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });

  detachKeyListener();
  process.stdout.off('resize', onResize);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  showCursor();
  leaveAltBuffer();
  if (state.statusMessage === '로그아웃 완료') {
    console.log(chalk.green('  로그아웃 완료. 다음 실행 시 handle을 다시 입력하세요.\n'));
  } else {
    console.log(chalk.dim('  BaekJS 대시보드를 종료했습니다.\n'));
  }
}
