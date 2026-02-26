import chalk from 'chalk';
import path from 'path';
import { createInterface } from 'readline/promises';
import readline from 'readline';
import { ensureConfigInteractive, getProjectRoot, loadConfig, saveConfig, ensureProblemFile } from './config.js';
import {
  getSourceCatalog,
  getTagCatalog,
  getProblemById,
  getUserClassProgress,
  getUserOverview,
  getSolvedProblemIds,
  searchProblems
} from './solvedac.js';
import { getProblemContent, getSamples } from './boj.js';
import { testProblem } from './commands/test.js';
import { exportProblem } from './commands/export.js';

/* ?? helpers ??????????????????????????????????????????? */

function formatNumber(n) {
  return Number(n).toLocaleString();
}

const TIER_NAMES = [
  'Unrated',
  'Bronze V', 'Bronze IV', 'Bronze III', 'Bronze II', 'Bronze I',
  'Silver V', 'Silver IV', 'Silver III', 'Silver II', 'Silver I',
  'Gold V', 'Gold IV', 'Gold III', 'Gold II', 'Gold I',
  'Platinum V', 'Platinum IV', 'Platinum III', 'Platinum II', 'Platinum I',
  'Diamond V', 'Diamond IV', 'Diamond III', 'Diamond II', 'Diamond I',
  'Ruby V', 'Ruby IV', 'Ruby III', 'Ruby II', 'Ruby I',
  'Master'
];

function getTierName(tier) {
  return TIER_NAMES[tier] || 'Unrated';
}

function getTierColor(tier) {
  if (tier === 0) return chalk.gray;
  if (tier <= 5) return chalk.hex('#AD5600');
  if (tier <= 10) return chalk.hex('#435F7A');
  if (tier <= 15) return chalk.hex('#EC9A00');
  if (tier <= 20) return chalk.hex('#27E2A4');
  if (tier <= 25) return chalk.hex('#00B4FC');
  if (tier <= 30) return chalk.hex('#FF0062');
  return chalk.hex('#B300E0');
}

function progressBar(current, total, width = 15) {
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.round(ratio * width);
  return chalk.cyan('\u2588'.repeat(filled)) + chalk.gray('\u2591'.repeat(width - filled));
}

const SPINNER_FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];

function createSpinner() {
  let frameIndex = 0;
  let intervalId = null;
  return {
    get frame() { return SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]; },
    start(renderFn) {
      intervalId = setInterval(() => {
        frameIndex++;
        renderFn();
      }, 80);
    },
    stop() {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    }
  };
}

function formatPath(fullPath) {
  let display = path.relative(process.cwd(), fullPath);
  if (display.startsWith('..')) display = fullPath;
  if (display.includes(' ')) display = `"${display}"`;
  return display;
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function getVisualWidth(str) {
  const clean = stripAnsi(str);
  let width = 0;
  for (const char of clean) {
    const code = char.codePointAt(0);
    if (
      (code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0x303E) ||
      (code >= 0x3040 && code <= 0x33BF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x4E00 && code <= 0xA4CF) ||
      (code >= 0xAC00 && code <= 0xD7AF) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE30 && code <= 0xFE4F) ||
      (code >= 0xFF01 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      (code >= 0x20000 && code <= 0x2FA1F)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function padEndVisual(str, targetWidth) {
  const padding = Math.max(0, targetWidth - getVisualWidth(str));
  return str + ' '.repeat(padding);
}

function padStartVisual(str, targetWidth) {
  const padding = Math.max(0, targetWidth - getVisualWidth(str));
  return ' '.repeat(padding) + str;
}

function sliceVisual(str, maxWidth) {
  let width = 0;
  let i = 0;
  for (const char of str) {
    const cw = getVisualWidth(char);
    if (width + cw > maxWidth) break;
    width += cw;
    i += char.length;
  }
  return str.slice(0, i);
}

/* ── constants ─────────────────────────────────────────────── */

const BOTTOM_TABS = [
  '문제 풀기',
  '내 문제',
  '내 정보',
  '종료'
];

const SOLVE_CATEGORIES = [
  { id: 'all', label: '전체 문제' },
  { id: 'source', label: '문제 출처' },
  { id: 'class', label: '단계별로 풀어보기' },
  { id: 'tag', label: '알고리즘 분류' },
  { id: 'recent', label: '추가된 문제' },
  { id: 'rank', label: '문제 순위' }
];

function getMyMenus(handle) {
  return [
    { label: '내가 실패한 문제', query: `tried_by:${handle} -solved_by:${handle}` },
    { label: '내가 못 푼 문제', query: `-solved_by:${handle}` },
    { label: '나만 푼 문제', query: `solved_by:${handle} solved:1` },
    { label: '맞은 사람이 한 명인 문제', query: 'solved:1' },
    { label: '아무도 못 푼 문제', query: 'solved:0' },
    { label: '안 푼 문제 랜덤', query: `-solved_by:${handle}`, sort: 'random' }
  ];
}

/* ?? rendering ????????????????????????????????????????? */

function enterAltBuffer() {
  process.stdout.write('\x1b[?1049h\x1b[?1000h\x1b[?1006h');
}

function leaveAltBuffer() {
  process.stdout.write('\x1b[?1006l\x1b[?1000l\x1b[?1049l');
}

function clearAndRender(output) {
  process.stdout.write(`\x1b[H\x1b[2J${output}`);
}

function renderHeader(state, width = 54) {
  const W = Math.max(24, Number(width) || 54);
  const dim = chalk.dim;
  const lines = [];

  const frameLeft = `  ${dim('\u2502')}`;
  const frameRight = dim('\u2502');
  const fillLine = (text) => padEndVisual(sliceVisual(text, W), W);
  const emptyLine = () => frameLeft + ' '.repeat(W) + frameRight;

  lines.push(chalk.cyan(`  \u256D${'\u2500'.repeat(W)}\u256E`));

  if (!state.userOverview) {
    const sp = state.spinner?.frame || '\u25C6';
    lines.push(emptyLine());
    lines.push(frameLeft + chalk.cyan.bold(fillLine(` ${sp} BaekJS`)) + frameRight);
    lines.push(frameLeft + chalk.yellow(fillLine('   불러오는 중...')) + frameRight);
    lines.push(emptyLine());
  } else {
    const o = state.userOverview;
    const tierName = getTierName(o.tier);
    const tierColor = getTierColor(o.tier);

    lines.push(emptyLine());

    // 브랜드 + 핸들
    const brand = ' \u25C6 BaekJS';
    const handle = `${o.handle} `;
    const brandWidth = Math.max(0, W - getVisualWidth(handle));
    const leftBrand = padEndVisual(sliceVisual(brand, brandWidth), brandWidth);
    lines.push(
      frameLeft +
      chalk.cyan.bold(leftBrand) +
      chalk.white.bold(handle) +
      frameRight
    );

    // 구분선
    lines.push(frameLeft + chalk.dim(`  ${'\u2501'.repeat(W - 4)}  `) + frameRight);

    // 랭킹 + 풀이 수 (왼쪽), 티어 (오른쪽)
    const statsPrefix = ` #${formatNumber(o.rank)}등 \u00B7 ${o.solvedCount}문제 풀었음`;
    const tierStr = `${tierName} `;
    const statsWidth = Math.max(0, W - getVisualWidth(tierStr));
    const leftStats = padEndVisual(sliceVisual(statsPrefix, statsWidth), statsWidth);
    lines.push(
      frameLeft +
      chalk.gray(leftStats) +
      tierColor(tierStr) +
      frameRight
    );

    // Rating + Class
    const classDeco = o.classDecoration !== 'none' ? ` ${o.classDecoration}` : '';
    const ratingLine = ` Rating ${o.rating} \u00B7 Class ${o.class}${classDeco}`;
    lines.push(frameLeft + chalk.gray(fillLine(ratingLine)) + frameRight);

    lines.push(emptyLine());
  }

  lines.push(chalk.cyan(`  \u2570${'\u2500'.repeat(W)}\u256F`));
  return lines;
}

function renderTabs(items, activeIndex, focused) {
  return items
    .map((item, idx) => {
      if (idx === activeIndex) {
        return focused
          ? chalk.black.bgCyan(` ${item} `)
          : chalk.black.bgBlueBright(` ${item} `);
      }
      return chalk.gray(` ${item} `);
    })
    .join(chalk.dim(' \u00B7'));
}

function sliceAround(items, selected, windowSize = 14) {
  if (items.length <= windowSize) {
    return { start: 0, rows: items };
  }
  const half = Math.floor(windowSize / 2);
  let start = Math.max(0, selected - half);
  if (start + windowSize > items.length) {
    start = items.length - windowSize;
  }
  return { start, rows: items.slice(start, start + windowSize) };
}

function normalizeError(error) {
  return error?.message || String(error);
}

function getProblemTableMode(contentWidth = 54) {
  const width = Math.max(24, Number(contentWidth) || 54);
  return width < 44 ? 'compact' : 'full';
}

function getProblemTitleWidth(contentWidth = 54) {
  const width = Math.max(24, Number(contentWidth) || 54);
  const mode = getProblemTableMode(width);
  if (mode === 'compact') {
    return Math.max(10, width - 8); // "123456 " + title
  }
  const minTitle = 14;
  const maxTitle = 56;
  const reserved = 6 + 1 + 8 + 1 + 6; // id + sp + accepted + sp + rate
  return Math.max(minTitle, Math.min(maxTitle, width - reserved));
}

function formatProblemRow(problem, contentWidth = 54) {
  const mode = getProblemTableMode(contentWidth);
  const titleWidth = getProblemTitleWidth(contentWidth);
  const id = String(problem.problemId).padEnd(6, ' ');
  const rawTitle = String(problem.titleKo || problem.titles?.[0]?.title || '');
  const title = padEndVisual(sliceVisual(rawTitle, titleWidth), titleWidth);
  if (mode === 'compact') {
    return `${id} ${title}`;
  }
  const accepted = String(problem.acceptedUserCount ?? 0).padStart(8, ' ');
  const rate = `${Number(problem.averageTries || 0).toFixed(2)}`.padStart(6, ' ');
  return `${id}${title} ${accepted} ${rate}`;
}

function formatProblemHeader(contentWidth = 54) {
  const mode = getProblemTableMode(contentWidth);
  const titleWidth = getProblemTitleWidth(contentWidth);
  const id = padEndVisual('번호', 6);
  const title = padEndVisual('제목', titleWidth);
  if (mode === 'compact') {
    return `${id} ${title}`;
  }
  const accepted = padStartVisual('정답자수', 8);
  const rate = padStartVisual('난이도', 6);
  return `${id}${title} ${accepted} ${rate}`;
}

function renderView(state, layout = {}) {
  const view = state.viewStack[state.viewStack.length - 1];
  const lines = [];
  const contentWidth = Math.max(24, Number(layout.contentWidth) || 54);
  const termRows = Number(layout.termRows) || 40;

  if (!view) {
    lines.push(chalk.gray('  콘텐츠가 없습니다.'));
    return lines;
  }

  if (view.type === 'menu') {
    lines.push(chalk.bold(`  ${view.title}`));
    if (view.description) lines.push(chalk.gray(`  ${view.description}`));
    lines.push('');
    const { start, rows } = sliceAround(view.items, view.index);
    rows.forEach((item, localIdx) => {
      const absoluteIdx = start + localIdx;
      const isActive = absoluteIdx === view.index;
      lines.push(isActive ? chalk.cyan(`  > ${item.label}`) : `    ${item.label}`);
    });
    return lines;
  }

  if (view.type === 'problem-list') {
    lines.push(chalk.bold(`  ${view.title}`));
    lines.push(
      chalk.gray(`  총 ${formatNumber(view.count)}개 · ${view.page}페이지 · n/p: 페이지 이동`)
    );
    lines.push('');

    if (!view.items.length) {
      lines.push(chalk.yellow('  검색 결과가 없습니다.'));
      return lines;
    }

    lines.push(chalk.gray(`    ${formatProblemHeader(contentWidth)}`));
    const { start, rows } = sliceAround(view.items, view.index);
    rows.forEach((problem, localIdx) => {
      const absoluteIdx = start + localIdx;
      const isActive = absoluteIdx === view.index;
      const isSolved = state.solvedIds?.has(problem.problemId);
      const row = formatProblemRow(problem, contentWidth);
      if (isActive) {
        lines.push(chalk.cyan(`  > ${row}`));
      } else if (isSolved) {
        lines.push(chalk.green(`    ${row}`));
      } else {
        lines.push(`    ${row}`);
      }
    });
    return lines;
  }

  if (view.type === 'problem-detail') {
    const problem = view.problem;
    const tierName = getTierName(problem.level);
    const tierColor = getTierColor(problem.level);

    lines.push(chalk.bold(`  ${problem.problemId} - ${problem.titleKo || '제목 없음'}`));
    lines.push(
      `  ${tierColor(tierName)} ${chalk.gray('\u2502')} ${chalk.gray(`정답자 ${formatNumber(problem.acceptedUserCount)}명 · 평균 ${Number(problem.averageTries || 0).toFixed(2)}회`)}`
    );

    const tags = (problem.tags || [])
      .map((tag) => tag?.key || tag?.displayNames?.[0]?.name)
      .filter(Boolean)
      .slice(0, 8);
    if (tags.length) {
      lines.push(chalk.gray(`  태그: ${tags.join(', ')}`));
    }

    if (view.filePath) {
      lines.push(chalk.green(`  파일: ${formatPath(view.filePath)}`));
    }

    const detailTwoColumn = contentWidth >= 86 && termRows >= 22;
    const separatorWidth = 3; // " │ "
    const detailColumnWidth = detailTwoColumn
      ? Math.max(24, Math.floor((contentWidth - separatorWidth) / 2))
      : Math.max(20, contentWidth);

    const wrapText = (text, width) => {
      const result = [];
      const raw = String(text || '').trim();
      if (!raw) {
        result.push(chalk.gray('(없음)'));
        return result;
      }

      for (const line of raw.split('\n')) {
        if (line.length === 0) {
          result.push('');
          continue;
        }
        if (getVisualWidth(line) <= width) {
          result.push(line);
          continue;
        }

        let remaining = line;
        while (getVisualWidth(remaining) > width) {
          const sliced = sliceVisual(remaining, width);
          result.push(sliced);
          remaining = remaining.slice(sliced.length);
        }
        if (remaining) result.push(remaining);
      }
      return result;
    };

    const sectionHeader = (title) => chalk.bold.underline(title);
    const appendSection = (bucket, title, body) => {
      bucket.push(sectionHeader(title));
      bucket.push(...wrapText(body, detailColumnWidth));
    };

    // 왼쪽: 문제 / 입력 / 출력
    const leftLines = [];
    appendSection(leftLines, '문제', view.content?.description);
    leftLines.push('');
    appendSection(leftLines, '입력', view.content?.input);
    leftLines.push('');
    appendSection(leftLines, '출력', view.content?.output);

    // 오른쪽: 예제 전부
    const rightLines = [];
    if (!view.samples.length) {
      rightLines.push(sectionHeader('예제'));
      rightLines.push(chalk.gray('예제 없음'));
    } else {
      for (const sample of view.samples) {
        appendSection(rightLines, `예제 입력 ${sample.id}`, sample.input);
        rightLines.push('');
        appendSection(rightLines, `예제 출력 ${sample.id}`, sample.output);
        rightLines.push('');
      }
      if (rightLines.length && rightLines[rightLines.length - 1] === '') {
        rightLines.pop();
      }
    }

    lines.push('');
    if (detailTwoColumn) {
      const SEP = chalk.dim(' \u2502 ');
      lines.push(chalk.dim(`  ${'\u2500'.repeat(detailColumnWidth)}\u252c${'\u2500'.repeat(detailColumnWidth)}`));
      const maxRows = Math.max(leftLines.length, rightLines.length);
      for (let i = 0; i < maxRows; i++) {
        const left = padEndVisual(leftLines[i] || '', detailColumnWidth);
        const right = rightLines[i] || '';
        lines.push(`  ${left}${SEP}${right}`);
      }
      lines.push(chalk.dim(`  ${'\u2500'.repeat(detailColumnWidth)}\u2534${'\u2500'.repeat(detailColumnWidth)}`));
    } else {
      lines.push(chalk.dim(`  ${'\u2500'.repeat(contentWidth)}`));
      leftLines.forEach((line) => lines.push(`  ${line}`));
      lines.push('');
      lines.push(chalk.dim(`  ${'\u2500'.repeat(contentWidth)}`));
      rightLines.forEach((line) => lines.push(`  ${line}`));
      lines.push(chalk.dim(`  ${'\u2500'.repeat(contentWidth)}`));
    }
    lines.push('');

    view.actions.forEach((action, idx) => {
      const isActive = idx === view.index;
      lines.push(isActive ? chalk.cyan(`  > ${action.label}`) : `    ${action.label}`);
    });

    return lines;
  }

  if (view.type === 'profile') {
    const o = state.userOverview;
    if (!o) {
      lines.push(chalk.yellow('  불러오는 중...'));
      return lines;
    }

    const tierName = getTierName(o.tier);
    const tierColor = getTierColor(o.tier);
    const sectionLine = (title) => {
      const prefix = `  ─── ${title} `;
      const fill = Math.max(0, contentWidth - getVisualWidth(prefix));
      return chalk.dim(`${prefix}${'─'.repeat(fill)}`);
    };

    // 프로필
    lines.push(sectionLine('프로필'));
    lines.push('');

    const handleStr = chalk.white.bold(`  ${o.handle}`);
    const classDeco = o.classDecoration !== 'none' ? ` ${o.classDecoration}` : '';
    const tierAndClass = `${tierName} · Class ${o.class}${classDeco}`;
    const rightInfo = tierColor(tierAndClass);
    const gap = Math.max(1, contentWidth - getVisualWidth(`  ${o.handle}`) - getVisualWidth(tierAndClass));
    lines.push(handleStr + ' '.repeat(gap) + rightInfo);

    lines.push(chalk.gray(`  #${formatNumber(o.rank)}등 · ${o.solvedCount}문제 풀었음 · Rating ${o.rating}`));

    const joinDate = o.joinedAt ? o.joinedAt.slice(0, 10) : '?';
    lines.push(chalk.gray(`  가입일: ${joinDate} · 스타더스트: ${formatNumber(o.stardusts)}`));
    lines.push(chalk.gray(`  최대 연속 풀이: ${o.maxStreak}일 · 라이벌: ${o.rivalCount}명`));

    // 레이팅 구성
    lines.push('');
    lines.push(sectionLine('레이팅 구성'));
    lines.push('');

    const maxRating = Math.max(o.ratingByProblemsSum, o.ratingByClass, o.ratingBySolvedCount, o.ratingByVoteCount, 1);
    const ratingBar = (label, value) => {
      const bar = progressBar(value, maxRating, 16);
      return `  ${padEndVisual(label, 18)}${bar}  ${chalk.white(value)}`;
    };
    lines.push(ratingBar('문제 난이도 합', o.ratingByProblemsSum));
    lines.push(ratingBar('CLASS', o.ratingByClass));
    lines.push(ratingBar('풀이 수', o.ratingBySolvedCount));
    lines.push(ratingBar('기여 (투표)', o.ratingByVoteCount));

    // 난이도별 현황
    const stats = o.problemStats || [];
    if (stats.length > 0) {
      lines.push('');
      lines.push(sectionLine('난이도별 현황'));
      lines.push('');

      const tierGroups = [
        { name: 'Bronze', start: 1, end: 5 },
        { name: 'Silver', start: 6, end: 10 },
        { name: 'Gold', start: 11, end: 15 },
        { name: 'Platinum', start: 16, end: 20 },
        { name: 'Diamond', start: 21, end: 25 },
        { name: 'Ruby', start: 26, end: 30 }
      ];

      for (const group of tierGroups) {
        let solved = 0;
        let total = 0;
        for (const row of stats) {
          const lv = Number(row.level || 0);
          if (lv >= group.start && lv <= group.end) {
            solved += Number(row.solved || 0);
            total += Number(row.total || 0);
          }
        }
        if (total === 0) continue;
        const color = getTierColor(group.start);
        const bar = progressBar(solved, total, 12);
        const count = chalk.white(`${solved}`) + chalk.gray(`/${total}`);
        lines.push(`  ${color(padEndVisual(group.name, 10))}${bar}  ${count}`);
      }
    }

    // CLASS 진행도
    const classes = state.classProgress || [];
    if (classes.length > 0) {
      lines.push('');
      lines.push(sectionLine('CLASS 진행도'));
      lines.push('');

      for (const row of classes) {
        if (row.total === 0) continue;
        const classLabel = `CLASS ${String(row.class).padStart(2)}`;
        const bar = progressBar(row.solved, row.total, 12);
        const count = chalk.white(`${row.solved}`) + chalk.gray(`/${row.total}`);
        lines.push(`  ${padEndVisual(classLabel, 10)}${bar}  ${count}`);
      }
    }

    // 아레나
    if (o.arenaCompetedRoundCount > 0) {
      lines.push('');
      lines.push(sectionLine('아레나'));
      lines.push('');
      lines.push(chalk.gray(`  Rating: ${o.arenaRating} · Tier: ${getTierName(o.arenaTier)} · 참가: ${o.arenaCompetedRoundCount}회`));
    }

    // 액션
    lines.push('');
    lines.push(chalk.dim(`  ${'─'.repeat(contentWidth)}`));
    lines.push('');
    view.actions.forEach((action, idx) => {
      const isActive = idx === view.index;
      lines.push(isActive ? chalk.cyan(`  > ${action.label}`) : `    ${action.label}`);
    });

    return lines;
  }

  return [chalk.gray('  알 수 없는 화면')];
}

/* ── views ───────────────────────────────────────────── */

async function loadProblemListView({ title, query, sort, direction, page = 1 }) {
  const response = await searchProblems({ query, page, sort, direction });
  return {
    type: 'problem-list',
    title,
    query,
    sort,
    direction,
    page,
    count: response.count,
    items: response.items,
    index: 0
  };
}

function buildSolveMenu() {
  return {
    type: 'menu',
    title: '문제 풀기',
    description: '카테고리를 선택하세요.',
    index: 0,
    items: SOLVE_CATEGORIES.map((x) => ({ id: x.id, label: x.label }))
  };
}

function buildMyMenu(handle) {
  return {
    type: 'menu',
    title: '내 문제',
    description: '내 계정 기준 필터를 선택하세요.',
    index: 0,
    items: getMyMenus(handle).map((x) => ({ ...x }))
  };
}

function buildExitMenu() {
  return {
    type: 'menu',
    title: '종료',
    description: 'Enter를 누르면 대시보드를 종료합니다.',
    index: 0,
    items: [{ id: 'quit', label: '대시보드 종료' }]
  };
}

function buildProfileView() {
  return {
    type: 'profile',
    title: '내 정보',
    index: 0,
    actions: [
      { id: 'switch', label: '계정 전환' },
      { id: 'logout', label: '로그아웃' }
    ]
  };
}

function makeInitialView(bottomTab, handle) {
  if (bottomTab === 0) return [buildSolveMenu()];
  if (bottomTab === 1) return [buildMyMenu(handle)];
  if (bottomTab === 2) return [buildProfileView()];
  return [buildExitMenu()];
}

/* ?? prompt helpers ???????????????????????????????????? */

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

async function ensureHandle(config, projectRoot) {
  let handle = String(config.user?.handle || '').trim();

  if (handle) {
    try {
      await getUserOverview(handle);
    } catch (error) {
      console.log(chalk.yellow(`저장된 handle(${handle}) 검증 실패: ${normalizeError(error)}`));
      handle = '';
    }
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

/* ?? main ?????????????????????????????????????????????? */

export async function runDashboard() {
  const projectRoot = getProjectRoot(process.cwd());
  await ensureConfigInteractive(projectRoot);
  let config = loadConfig(projectRoot);
  const handle = await ensureHandle(config, projectRoot);
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
    const [overview, classes, solvedIds] = await Promise.all([
      getUserOverview(state.handle),
      getUserClassProgress(state.handle),
      getSolvedProblemIds(state.handle)
    ]);
    state.userOverview = overview;
    state.classProgress = classes;
    state.solvedIds = solvedIds;
  };

  const refreshSolvedIds = async () => {
    state.solvedIds = await getSolvedProblemIds(state.handle);
  };

  /* ?? render ?? */

  const render = () => {
    const lines = [];
    const termCols = process.stdout.columns || 80;
    const termRows = process.stdout.rows || 40;
    const contentWidth = Math.max(24, Math.min(100, termCols - 4));
    const layout = { termCols, termRows, contentWidth };

    lines.push('');
    lines.push(...renderHeader(state, contentWidth));
    lines.push('');
    lines.push(`  ${renderTabs(BOTTOM_TABS, state.bottomTabIndex, true)}`);
    lines.push(chalk.dim(`  ${'\u2500'.repeat(contentWidth)}`));
    lines.push('');

    const viewLines = renderView(state, layout);
    const footerFixedLines =
      2 + // blank + key hint
      (state.busy ? 1 : 0) +
      (state.statusMessage ? 1 : 0);
    let availableHeight = Math.max(4, termRows - lines.length - footerFixedLines);
    let scrollable = false;

    if (viewLines.length > availableHeight) {
      scrollable = true;
      availableHeight = Math.max(4, availableHeight - 1); // pager line
    }

    state.viewportHeight = availableHeight;

    if (scrollable) {
      const maxScroll = viewLines.length - availableHeight;
      if (state.scrollOffset > maxScroll) state.scrollOffset = maxScroll;
      if (state.scrollOffset < 0) state.scrollOffset = 0;
      const sliced = viewLines.slice(state.scrollOffset, state.scrollOffset + availableHeight);
      lines.push(...sliced);
      const page = Math.floor(state.scrollOffset / availableHeight) + 1;
      const totalPages = Math.ceil(viewLines.length / availableHeight);
      lines.push(chalk.dim(`  [${page}/${totalPages}] PgUp/PgDn 스크롤`));
    } else {
      state.scrollOffset = 0;
      lines.push(...viewLines);
    }

    lines.push('');
    const scrollHint = scrollable
      ? chalk.white('마우스휠') + chalk.gray(' 또는 ') + chalk.white('PgUp/Dn') + chalk.gray(' 스크롤  ')
      : '';
    lines.push(
      '  ' +
      chalk.white('Tab') + chalk.gray(' 탭이동  ') +
      chalk.white('Enter') + chalk.gray(' 선택  ') +
      chalk.white('\u2191\u2193') + chalk.gray(' 이동  ') +
      scrollHint +
      chalk.white('Esc') + chalk.gray(' 뒤로  ') +
      chalk.white('q') + chalk.gray(' 종료')
    );
    if (state.busy) {
      const sp = state.spinner?.frame || '\u25C6';
      lines.push(chalk.yellow(`  ${sp} 불러오는 중...`));
    }
    if (state.statusMessage) {
      lines.push(chalk.green(`  ${state.statusMessage}`));
    }

    clearAndRender(`${lines.join('\n')}\n`);
  };

  /* ?? async helpers ?? */

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
    process.stdout.write('\x1b[?25h');
    leaveAltBuffer();
  };
  const resumeDashboardUi = () => {
    enterAltBuffer();
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write('\x1b[?25l');
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

  /* ?? navigation ?? */

  const openProblemDetail = async (problemId) => {
    const problem = await getProblemById(problemId);
    const { created, filePath } = ensureProblemFile(problemId, {
      projectRoot: state.projectRoot,
      templateStyle: state.config.templateStyle
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
      title: '단계별로 풀어보기',
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
      title: '문제 출처',
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
      title: '알고리즘 분류',
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
      title: '문제 순위',
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
            title: '전체 문제',
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
            title: '추가된 문제',
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
          title: `CLASS ${item.id} 문제`,
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

  /* ?? keypress handler ?? */

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
    if (key?.ctrl && key.name === 'c') {
      state.quit = true;
      return;
    }

    // Busy 상태에서 추가 입력을 막아 view/state race를 방지한다.
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

    // Content zone
    const current = state.viewStack[state.viewStack.length - 1];
    if (!current) return;

    if (key?.name === 'escape' || key?.name === 'backspace') {
      if (state.viewStack.length > 1) {
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
      }
      render();
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

        if (current.type === 'problem-detail') {
          const selectedAction = current.actions[current.index];
          if (!selectedAction) return;
          if (selectedAction.id === 'back') {
            state.viewStack.pop();
            state.scrollOffset = 0;
            const nextView = state.viewStack[state.viewStack.length - 1];
            if (nextView?.type === 'problem-list') {
              await refreshSolvedIds();
              state.statusMessage = '풀이 상태를 최신으로 갱신했습니다.';
            }
            return;
          }
          if (selectedAction.id === 'quit') {
            state.quit = true;
          }
        }
      });
      return;
    }
  };

  /* ?? start ?? */

  const onResize = () => render();
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  enterAltBuffer();
  process.stdout.write('\x1b[?25l');
  process.stdout.on('resize', onResize);

  // 로딩 화면 표시 + 스피너
  const loadingSpinner = createSpinner();
  state.spinner = loadingSpinner;
  render();
  loadingSpinner.start(() => render());

  await reloadUserInfo();

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
  process.stdout.write('\x1b[?25h');
  leaveAltBuffer();
  if (state.statusMessage === '로그아웃 완료') {
    console.log(chalk.green('  로그아웃 완료. 다음 실행 시 handle을 다시 입력하세요.\n'));
  } else {
    console.log(chalk.dim('  BaekJS 대시보드를 종료했습니다.\n'));
  }
}
