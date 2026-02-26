import chalk from 'chalk';

/* ── tier ──────────────────────────────────────────────── */

export const TIER_NAMES = [
  'Unrated',
  'Bronze V', 'Bronze IV', 'Bronze III', 'Bronze II', 'Bronze I',
  'Silver V', 'Silver IV', 'Silver III', 'Silver II', 'Silver I',
  'Gold V', 'Gold IV', 'Gold III', 'Gold II', 'Gold I',
  'Platinum V', 'Platinum IV', 'Platinum III', 'Platinum II', 'Platinum I',
  'Diamond V', 'Diamond IV', 'Diamond III', 'Diamond II', 'Diamond I',
  'Ruby V', 'Ruby IV', 'Ruby III', 'Ruby II', 'Ruby I',
  'Master'
];

export function getTierName(tier) {
  return TIER_NAMES[tier] || 'Unrated';
}

export function getTierColor(tier) {
  if (tier === 0) return chalk.gray;
  if (tier <= 5) return chalk.hex('#AD5600');
  if (tier <= 10) return chalk.hex('#435F7A');
  if (tier <= 15) return chalk.hex('#EC9A00');
  if (tier <= 20) return chalk.hex('#27E2A4');
  if (tier <= 25) return chalk.hex('#00B4FC');
  if (tier <= 30) return chalk.hex('#FF0062');
  return chalk.hex('#B300E0');
}

/* ── ui primitives ────────────────────────────────────── */

export function progressBar(current, total, width = 15) {
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.round(ratio * width);
  return chalk.cyan('\u2588'.repeat(filled)) + chalk.gray('\u2591'.repeat(width - filled));
}

const SPINNER_FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];

export function createSpinner() {
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

/* ── menus / categories ───────────────────────────────── */

export const BOTTOM_TABS = [
  '문제 풀기',
  '내 문제',
  '내 정보',
  '종료'
];

export const SOLVE_CATEGORIES = [
  { id: 'all', label: '전체 문제' },
  { id: 'source', label: '문제 출처' },
  { id: 'class', label: '단계별로 풀어보기' },
  { id: 'tag', label: '알고리즘 분류' },
  { id: 'recent', label: '추가된 문제' },
  { id: 'rank', label: '문제 순위' }
];

export function getMyMenus(handle) {
  return [
    { label: '내가 실패한 문제', query: `tried_by:${handle} -solved_by:${handle}` },
    { label: '내가 못 푼 문제', query: `-solved_by:${handle}` },
    { label: '나만 푼 문제', query: `solved_by:${handle} solved:1` },
    { label: '맞은 사람이 한 명인 문제', query: 'solved:1' },
    { label: '아무도 못 푼 문제', query: 'solved:0' },
    { label: '안 푼 문제 랜덤', query: `-solved_by:${handle}`, sort: 'random' }
  ];
}

/* ── misc ─────────────────────────────────────────────── */

export function normalizeError(error) {
  return error?.message || String(error);
}
