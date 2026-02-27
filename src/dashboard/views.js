import { searchProblems } from '../solvedac.js';
import { SOLVE_CATEGORIES, getMyMenus } from './constants.js';

export async function loadProblemListView({ title, query, sort, direction, page = 1 }) {
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

export function buildSolveMenu() {
  return {
    type: 'menu',
    title: '문제 풀기',
    description: '카테고리를 선택하세요.',
    index: 0,
    items: SOLVE_CATEGORIES.map((x) => ({ id: x.id, label: x.label }))
  };
}

export function buildMyMenu(handle) {
  return {
    type: 'menu',
    title: '내 문제',
    description: '내 계정 기준 필터를 선택하세요.',
    index: 0,
    items: getMyMenus(handle).map((x) => ({ ...x }))
  };
}

export function buildExitMenu() {
  return {
    type: 'menu',
    title: '종료',
    description: 'Enter를 누르면 대시보드를 종료합니다.',
    index: 0,
    items: [{ id: 'quit', label: '대시보드 종료' }]
  };
}

export function buildProfileView() {
  return {
    type: 'profile',
    title: '내 정보',
    index: 0,
    actions: [
      { id: 'settings', label: '설정' },
      { id: 'switch', label: '계정 전환' },
      { id: 'logout', label: '로그아웃' }
    ]
  };
}

export function buildSettingsView(config) {
  return {
    type: 'settings',
    title: '설정',
    index: 0,
    items: [
      { id: 'ioMode', label: '입력 방식', value: config.ioMode },
      { id: 'templateComments', label: '템플릿 주석', value: config.templateComments },
      { id: 'back', label: '돌아가기' }
    ]
  };
}

export function makeInitialView(bottomTab, handle) {
  if (bottomTab === 0) return [buildSolveMenu()];
  if (bottomTab === 1) return [buildMyMenu(handle)];
  if (bottomTab === 2) return [buildProfileView()];
  return [buildExitMenu()];
}
