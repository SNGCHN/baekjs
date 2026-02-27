import chalk from 'chalk';
import {
  formatNumber,
  getVisualWidth,
  padEndVisual,
  padStartVisual,
  sliceVisual,
  formatPath
} from '../utils/string.js';
import {
  getTierName,
  getTierColor,
  progressBar,
  BOTTOM_TABS
} from './constants.js';
import { clearAndRender } from './terminal.js';

/* table formatting */

function getProblemTableMode(contentWidth = 54) {
  const width = Math.max(24, Number(contentWidth) || 54);
  return width < 48 ? 'compact' : 'full';
}

function getProblemTitleWidth(contentWidth = 54) {
  const width = Math.max(24, Number(contentWidth) || 54);
  const mode = getProblemTableMode(width);
  if (mode === 'compact') return Math.max(10, width - 8);

  const minTitle = 14;
  const maxTitle = 56;
  const reserved = 6 + 1 + 8 + 1 + 6;
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
  const tries = `${Number(problem.averageTries || 0).toFixed(2)}`.padStart(6, ' ');
  return `${id}${title} ${accepted} ${tries}`;
}

function formatProblemHeader(contentWidth = 54) {
  const mode = getProblemTableMode(contentWidth);
  const titleWidth = getProblemTitleWidth(contentWidth);
  const id = padEndVisual('ID', 6);
  const title = padEndVisual('TITLE', titleWidth);

  if (mode === 'compact') {
    return `${id} ${title}`;
  }

  const accepted = padStartVisual('ACCEPT', 8);
  const tries = padStartVisual('TRIES', 6);
  return `${id}${title} ${accepted} ${tries}`;
}

function wrapByWidth(text, width, { trim = false, emptyText = '' } = {}) {
  const result = [];
  const source = String(text || '');
  const raw = trim ? source.trim() : source;

  if (!raw) {
    if (emptyText) result.push(emptyText);
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
}

/* top header */

export function renderHeader(state, width = 54) {
  const W = Math.max(24, Number(width) || 54);
  const dim = chalk.dim;
  const lines = [];

  const frameLeft = `  ${dim('|')}`;
  const frameRight = dim('|');
  const fit = (text) => padEndVisual(sliceVisual(text, W), W);

  lines.push(chalk.cyan(`  +${'-'.repeat(W)}+`));

  if (!state.userOverview) {
    const sp = state.spinner?.frame || '*';
    lines.push(frameLeft + fit('') + frameRight);
    lines.push(frameLeft + chalk.cyan.bold(fit(` ${sp} BaekJS Dashboard`)) + frameRight);
    lines.push(frameLeft + chalk.yellow(fit('   Loading user info...')) + frameRight);
    lines.push(frameLeft + fit('') + frameRight);
  } else {
    const o = state.userOverview;
    const tierName = getTierName(o.tier);
    const tierColor = getTierColor(o.tier);

    lines.push(frameLeft + fit('') + frameRight);
    lines.push(frameLeft + chalk.cyan.bold(fit(` User: ${o.handle}`)) + frameRight);
    lines.push(frameLeft + chalk.gray(fit(` Rank #${formatNumber(o.rank)} | Solved ${formatNumber(o.solvedCount)} | Rating ${o.rating}`)) + frameRight);
    lines.push(frameLeft + chalk.gray(fit(` Tier: ${tierName} | Class ${o.class}`)) + frameRight);
    lines.push(frameLeft + tierColor(fit('')) + frameRight);
    lines.push(frameLeft + fit('') + frameRight);
  }

  lines.push(chalk.cyan(`  +${'-'.repeat(W)}+`));
  return lines;
}

export function renderTabs(items, activeIndex, focused) {
  return items
    .map((item, idx) => {
      if (idx === activeIndex) {
        return focused
          ? chalk.black.bgCyan(` ${item} `)
          : chalk.black.bgBlueBright(` ${item} `);
      }
      return chalk.gray(` ${item} `);
    })
    .join(chalk.dim(' · '));
}

/* view renderer */

export function renderView(state, layout = {}) {
  const view = state.viewStack[state.viewStack.length - 1];
  const lines = [];
  const contentWidth = Math.max(24, Number(layout.contentWidth) || 54);
  const termRows = Number(layout.termRows) || 40;

  if (!view) {
    return { lines: [chalk.gray('  No content')] };
  }

  if (view.type === 'menu') {
    lines.push(chalk.bold(`  ${view.title}`));
    if (view.description) lines.push(chalk.gray(`  ${view.description}`));
    lines.push('');

    const headerLen = lines.length;
    view.items.forEach((item, idx) => {
      const isActive = idx === view.index;
      lines.push(isActive ? chalk.cyan(`  > ${item.label}`) : `    ${item.label}`);
    });

    if (!view.items.length) return { lines };
    return {
      lines,
      focusLine: headerLen + view.index,
      itemInfo: { current: view.index + 1, total: view.items.length }
    };
  }

  if (view.type === 'problem-list') {
    lines.push(chalk.bold(`  ${view.title}`));
    lines.push(chalk.gray(`  total ${formatNumber(view.count)} | page ${view.page} | n/p: move page`));
    lines.push('');

    if (!view.items.length) {
      lines.push(chalk.yellow('  No search results.'));
      return { lines };
    }

    lines.push(chalk.gray(`    ${formatProblemHeader(contentWidth)}`));
    const headerLen = lines.length;

    view.items.forEach((problem, idx) => {
      const isActive = idx === view.index;
      const isSolved = state.solvedIds?.has(problem.problemId);
      const row = formatProblemRow(problem, contentWidth);

      if (isActive) lines.push(chalk.cyan(`  > ${row}`));
      else if (isSolved) lines.push(chalk.green(`    ${row}`));
      else lines.push(`    ${row}`);
    });

    return {
      lines,
      focusLine: headerLen + view.index,
      itemInfo: { current: view.index + 1, total: view.items.length }
    };
  }

  if (view.type === 'problem-detail') {
    const problem = view.problem;
    const tierName = getTierName(problem.level);
    const tierColor = getTierColor(problem.level);

    const pushWrapped = (text, style = (v) => v) => {
      const wrapped = wrapByWidth(text, contentWidth);
      if (!wrapped.length) return;
      lines.push(style(`  ${wrapped[0]}`));
      for (let i = 1; i < wrapped.length; i++) {
        lines.push(style(`    ${wrapped[i]}`));
      }
    };

    pushWrapped(`${problem.problemId} - ${problem.titleKo || 'Untitled'}`, chalk.bold);

    const statsLine = `accepted ${formatNumber(problem.acceptedUserCount)} users | avg ${Number(problem.averageTries || 0).toFixed(2)} tries`;
    const statsWidth = Math.max(12, contentWidth - getVisualWidth(tierName) - 5);
    const statsWrapped = wrapByWidth(statsLine, statsWidth);
    if (statsWrapped.length > 0) {
      lines.push(`  ${tierColor(tierName)} ${chalk.gray('|')} ${chalk.gray(statsWrapped[0])}`);
      for (let i = 1; i < statsWrapped.length; i++) {
        lines.push(chalk.gray(`    ${statsWrapped[i]}`));
      }
    }

    const tags = (problem.tags || [])
      .map((tag) => tag?.key || tag?.displayNames?.[0]?.name)
      .filter(Boolean)
      .slice(0, 8);
    if (tags.length) {
      pushWrapped(`Tags: ${tags.join(', ')}`, chalk.gray);
    }

    if (view.filePath) {
      pushWrapped(`File: ${formatPath(view.filePath)}`, chalk.green);
    }

    // 항상 2열 레이아웃 적용
    const detailTwoColumn = true;
    const separatorWidth = 3;
    const detailColumnWidth = Math.max(24, Math.floor((contentWidth - separatorWidth) / 2));

    const BAR = chalk.cyan('\u258F');
    const SAMPLE_BAR = chalk.dim('\u2502');

    const sectionHeader = (title) => `${BAR} ${chalk.cyan.bold(title)}`;
    const sampleHeader = (title) => `${BAR} ${chalk.yellow.bold(title)}`;
    const bodyWidth = Math.max(10, detailColumnWidth - 4);
    const bodyWrap = (text) => wrapByWidth(text, bodyWidth, { trim: true, emptyText: chalk.gray('(empty)') });

    const appendSection = (bucket, title, body) => {
      bucket.push(sectionHeader(title));
      for (const line of bodyWrap(body)) {
        bucket.push(line ? `    ${line}` : '');
      }
    };

    const appendSample = (bucket, title, body) => {
      bucket.push(sampleHeader(title));
      for (const line of bodyWrap(body)) {
        bucket.push(line ? `  ${SAMPLE_BAR} ${chalk.white(line)}` : '');
      }
    };

    const leftLines = [];
    appendSection(leftLines, '\uBB38\uC81C', view.content?.description);
    leftLines.push('');
    appendSection(leftLines, '\uC785\uB825', view.content?.input);
    leftLines.push('');
    appendSection(leftLines, '\uCD9C\uB825', view.content?.output);

    const rightLines = [];
    const samples = Array.isArray(view.samples) ? view.samples : [];
    if (!samples.length) {
      rightLines.push(sampleHeader('\uC608\uC81C'));
      rightLines.push(chalk.gray('    (none)'));
    } else {
      for (const sample of samples) {
        appendSample(rightLines, `\uC608\uC81C \uC785\uB825 ${sample.id}`, sample.input);
        rightLines.push('');
        appendSample(rightLines, `\uC608\uC81C \uCD9C\uB825 ${sample.id}`, sample.output);
        if (sample !== samples[samples.length - 1]) rightLines.push('');
      }
    }

    lines.push('');
    if (detailTwoColumn) {
      const SEP = chalk.dim(' \u2502 ');
      lines.push(chalk.dim(`  ${'─'.repeat(detailColumnWidth)}┬${'─'.repeat(detailColumnWidth)}`));
      const maxRows = Math.max(leftLines.length, rightLines.length);
      for (let i = 0; i < maxRows; i++) {
        const left = padEndVisual(leftLines[i] || '', detailColumnWidth);
        const right = padEndVisual(rightLines[i] || '', detailColumnWidth);
        lines.push(`  ${left}${SEP}${right}`);
      }
      lines.push(chalk.dim(`  ${'─'.repeat(detailColumnWidth)}┴${'─'.repeat(detailColumnWidth)}`));
    } else {
      lines.push(chalk.dim(`  ${'─'.repeat(contentWidth)}`));
      leftLines.forEach((line) => lines.push(`  ${line}`));
      lines.push('');
      lines.push(chalk.dim(`  ${'─'.repeat(contentWidth)}`));
      rightLines.forEach((line) => lines.push(`  ${line}`));
      lines.push(chalk.dim(`  ${'─'.repeat(contentWidth)}`));
    }

    /* actions → fixedFooter (rendered outside scroll area) */
    const fixedFooter = [];
    fixedFooter.push(chalk.dim(`  ${'─'.repeat(Math.min(40, contentWidth))}`));
    view.actions.forEach((action, idx) => {
      const isActive = idx === view.index;
      fixedFooter.push(isActive ? chalk.cyan(`  > ${action.label}`) : chalk.dim(`    ${action.label}`));
    });

    return {
      lines,
      fixedFooter,
      itemInfo: { current: view.index + 1, total: view.actions.length }
    };
  }

  if (view.type === 'settings') {
    lines.push(chalk.bold('  설정'));
    lines.push('');

    const settingStart = lines.length;
    for (let idx = 0; idx < view.items.length; idx++) {
      const item = view.items[idx];
      const isActive = idx === view.index;
      const prefix = isActive ? chalk.cyan('  > ') : '    ';

      if (item.id === 'back') {
        lines.push('');
        lines.push(isActive ? chalk.cyan('  > 돌아가기') : chalk.dim('    돌아가기'));
      } else {
        const label = padEndVisual(item.label, 16);
        let display;
        if (item.id === 'templateComments') {
          display = item.value ? chalk.green('ON') : chalk.red('OFF');
        } else {
          display = chalk.white(String(item.value));
        }
        lines.push(`${prefix}${label} ${display}`);
      }
    }

    return {
      lines,
      focusLine: settingStart + view.index,
      itemInfo: { current: view.index + 1, total: view.items.length }
    };
  }

  if (view.type === 'profile') {
    const o = state.userOverview;
    if (!o) return { lines: [chalk.yellow('  Loading profile...')] };

    const tierName = getTierName(o.tier);
    const tierColor = getTierColor(o.tier);

    lines.push(chalk.bold('  Profile'));
    lines.push('');
    lines.push(`  ${chalk.white.bold(o.handle)} ${chalk.gray('|')} ${tierColor(`${tierName} | Class ${o.class}`)}`);
    lines.push(chalk.gray(`  Rank #${formatNumber(o.rank)} | Solved ${formatNumber(o.solvedCount)} | Rating ${o.rating}`));
    lines.push(chalk.gray(`  Joined ${o.joinedAt ? o.joinedAt.slice(0, 10) : '?'} | Stardust ${formatNumber(o.stardusts)}`));
    lines.push(chalk.gray(`  Max streak ${o.maxStreak} | Rivals ${o.rivalCount}`));

    lines.push('');
    lines.push(chalk.bold('  Rating Breakdown'));
    lines.push('');

    const maxRating = Math.max(o.ratingByProblemsSum, o.ratingByClass, o.ratingBySolvedCount, o.ratingByVoteCount, 1);
    const ratingBar = (label, value) => {
      const safeValue = Number(value || 0);
      const bar = progressBar(safeValue, maxRating, 16);
      return `  ${padEndVisual(label, 18)}${bar}  ${chalk.white(safeValue)}`;
    };

    lines.push(ratingBar('By Problems', o.ratingByProblemsSum));
    lines.push(ratingBar('By Class', o.ratingByClass));
    lines.push(ratingBar('By Solved', o.ratingBySolvedCount));
    lines.push(ratingBar('By Votes', o.ratingByVoteCount));

    const classes = state.classProgress || [];
    if (classes.length > 0) {
      lines.push('');
      lines.push(chalk.bold('  Class Progress'));
      lines.push('');

      for (const row of classes) {
        if (!row.total) continue;
        const classLabel = `CLASS ${String(row.class).padStart(2, '0')}`;
        const bar = progressBar(row.solved, row.total, 12);
        const count = chalk.white(`${row.solved}`) + chalk.gray(`/${row.total}`);
        lines.push(`  ${padEndVisual(classLabel, 10)}${bar}  ${count}`);
      }
    }

    if (o.arenaCompetedRoundCount > 0) {
      lines.push('');
      lines.push(chalk.bold('  Arena'));
      lines.push(chalk.gray(`  Rating ${o.arenaRating} | Tier ${getTierName(o.arenaTier)} | Rounds ${o.arenaCompetedRoundCount}`));
    }

    lines.push('');
    lines.push(chalk.dim(`  ${'-'.repeat(contentWidth)}`));
    lines.push('');

    const actionStart = lines.length;
    view.actions.forEach((action, idx) => {
      const isActive = idx === view.index;
      lines.push(isActive ? chalk.cyan(`  > ${action.label}`) : `    ${action.label}`);
    });

    return {
      lines,
      focusLine: actionStart + view.index,
      itemInfo: { current: view.index + 1, total: view.actions.length }
    };
  }

  return { lines: [chalk.gray('  Unknown view')] };
}

/* compose full screen */

export function renderScreen(state) {
  const lines = [];
  const termCols = process.stdout.columns || 80;
  const termRows = process.stdout.rows || 40;
  const currentView = state.viewStack[state.viewStack.length - 1];
  const isProblemFocus = currentView?.type === 'problem-detail';

  const contentWidth = isProblemFocus
    ? Math.max(24, Math.min(140, termCols - 2))
    : Math.max(24, Math.min(100, termCols - 4));
  const layout = { termCols, termRows, contentWidth };

  lines.push('');

  if (isProblemFocus) {
    const focusTitle = `${currentView.problem?.problemId || ''} ${currentView.problem?.titleKo || ''}`.trim();
    const topText = focusTitle ? `Problem Focus | ${focusTitle}` : 'Problem Focus';
    lines.push(chalk.cyan.bold(`  ${sliceVisual(topText, contentWidth)}`));
    lines.push(chalk.dim(`  ${'-'.repeat(contentWidth)}`));
  } else {
    lines.push(...renderHeader(state, contentWidth));
    lines.push('');
    lines.push(`  ${renderTabs(BOTTOM_TABS, state.bottomTabIndex, true)}`);
    lines.push(chalk.dim(`  ${'-'.repeat(contentWidth)}`));
    lines.push('');
  }

  const renderedView = renderView(state, layout);
  const viewLines = renderedView.lines;
  const focusLine = renderedView.focusLine;
  const itemInfo = renderedView.itemInfo;
  const fixedFooter = renderedView.fixedFooter || [];

  const footerFixedLines =
    (isProblemFocus ? 1 : 2) +
    fixedFooter.length +
    (state.busy ? 1 : 0) +
    (state.statusMessage ? 1 : 0);

  let availableHeight = Math.max(4, termRows - lines.length - footerFixedLines);
  let scrollable = false;

  if (viewLines.length > availableHeight) {
    scrollable = true;
    availableHeight = Math.max(4, availableHeight - 1);
  }

  state.viewportHeight = availableHeight;

  const viewChanged = state._autoFollowView !== currentView;
  const indexChanged = state._autoFollowIndex !== currentView?.index;
  const followOnViewChange = currentView?.type === 'menu' || currentView?.type === 'problem-list';
  const shouldAutoFollow =
    scrollable &&
    Number.isInteger(focusLine) &&
    ((indexChanged && !viewChanged) || (followOnViewChange && viewChanged));

  if (shouldAutoFollow) {
    const margin = Math.min(2, Math.max(0, Math.floor((availableHeight - 1) / 4)));
    const topBound = state.scrollOffset + margin;
    const bottomBound = state.scrollOffset + availableHeight - 1 - margin;

    if (focusLine < topBound) {
      state.scrollOffset = focusLine - margin;
    } else if (focusLine > bottomBound) {
      state.scrollOffset = focusLine - (availableHeight - 1 - margin);
    }
  }

  if (scrollable) {
    const maxScroll = viewLines.length - availableHeight;
    if (state.scrollOffset > maxScroll) state.scrollOffset = maxScroll;
    if (state.scrollOffset < 0) state.scrollOffset = 0;

    const sliced = viewLines.slice(state.scrollOffset, state.scrollOffset + availableHeight);
    lines.push(...sliced);

    const indicator = [];
    if (itemInfo && Number.isFinite(itemInfo.current) && Number.isFinite(itemInfo.total) && itemInfo.total > 0) {
      indicator.push(`item ${itemInfo.current}/${itemInfo.total}`);
    }
    const totalPages = Math.ceil(viewLines.length / availableHeight);
    const page = totalPages <= 1
      ? 1
      : (state.scrollOffset >= maxScroll ? totalPages : Math.floor(state.scrollOffset / availableHeight) + 1);
    indicator.push(`view ${page}/${totalPages}`);
    lines.push(chalk.dim(`  ${indicator.join(' | ')} | j/k, PgUp/PgDn, mouse wheel`));
  } else {
    state.scrollOffset = 0;
    lines.push(...viewLines);
  }

  state._autoFollowView = currentView;
  state._autoFollowIndex = currentView?.index;

  /* fixed footer (problem-detail actions pinned below scroll area) */
  if (fixedFooter.length > 0) {
    lines.push(...fixedFooter);
  }

  if (!isProblemFocus) lines.push('');
  if (isProblemFocus) {
    lines.push(chalk.dim('  \u2191\u2193: action | j/k: scroll | PgUp/PgDn | Enter: run | Esc: back | q: quit'));
  } else {
    lines.push(chalk.dim('  Tab: switch | Up/Down: select | Enter: confirm | Esc: back | q: quit'));
  }

  if (state.busy) {
    const sp = state.spinner?.frame || '*';
    lines.push(chalk.yellow(`  ${sp} Loading...`));
  }

  if (state.statusMessage) {
    const isError = state.statusMessage.startsWith('Error:');
    lines.push(isError ? chalk.red(`  ${state.statusMessage}`) : chalk.green(`  ${state.statusMessage}`));
  }

  clearAndRender(`${lines.join('\n')}\n`);
}
