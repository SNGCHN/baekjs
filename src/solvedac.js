const SOLVED_AC_BASE_URL = 'https://solved.ac/api/v3';

function toQueryString(params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
  if (entries.length === 0) {
    return '';
  }

  const usp = new URLSearchParams();
  for (const [key, value] of entries) {
    usp.set(key, String(value));
  }

  return `?${usp.toString()}`;
}

async function solvedFetch(path, params = {}, options = {}) {
  const url = `${SOLVED_AC_BASE_URL}${path}${toQueryString(params)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`solved.ac request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

let tagCatalogCache = null;
let sourceCatalogCache = null;

export async function getUserOverview(handle) {
  const [profile, problemStats, failedStats] = await Promise.all([
    solvedFetch('/user/show', { handle }),
    solvedFetch('/user/problem_stats', { handle }),
    solvedFetch('/search/problem', { query: `tried_by:${handle} -solved_by:${handle}` })
  ]);

  const triedTotal = Array.isArray(problemStats)
    ? problemStats.reduce((acc, row) => acc + Number(row.tried || 0), 0)
    : 0;

  return {
    handle: profile.handle,
    rank: profile.rank,
    solvedCount: profile.solvedCount,
    tier: profile.tier,
    rating: profile.rating,
    triedButUnsolved: failedStats.count ?? 0,
    triedTotal,
    class: profile.class ?? 0,
    classDecoration: profile.classDecoration || 'none',
    maxStreak: profile.maxStreak ?? 0,
    ratingByProblemsSum: profile.ratingByProblemsSum ?? 0,
    ratingByClass: profile.ratingByClass ?? 0,
    ratingBySolvedCount: profile.ratingBySolvedCount ?? 0,
    ratingByVoteCount: profile.ratingByVoteCount ?? 0,
    joinedAt: profile.joinedAt || '',
    rivalCount: profile.rivalCount ?? 0,
    reverseRivalCount: profile.reverseRivalCount ?? 0,
    stardusts: profile.stardusts ?? 0,
    arenaTier: profile.arenaTier ?? 0,
    arenaRating: profile.arenaRating ?? 0,
    arenaCompetedRoundCount: profile.arenaCompetedRoundCount ?? 0,
    problemStats: Array.isArray(problemStats) ? problemStats : []
  };
}

export async function getUserClassProgress(handle) {
  const [classes, userStats] = await Promise.all([
    solvedFetch('/problem/class'),
    solvedFetch('/user/class_stats', { handle })
  ]);

  const solvedByClass = new Map();
  for (const row of userStats || []) {
    solvedByClass.set(Number(row.class), Number(row.totalSolved || 0));
  }

  return (classes || []).map((entry) => {
    const classNo = Number(entry.class);
    return {
      class: classNo,
      total: Number(entry.total || 0),
      essentials: Number(entry.essentials || 0),
      criteria: Number(entry.criteria || 0),
      solved: solvedByClass.get(classNo) || 0
    };
  });
}

export async function searchProblems({
  query,
  page = 1,
  sort,
  direction
}) {
  const result = await solvedFetch('/search/problem', {
    query,
    page,
    sort,
    direction
  });

  return {
    count: Number(result.count || 0),
    items: Array.isArray(result.items) ? result.items : []
  };
}

export async function getProblemById(problemId) {
  return solvedFetch('/problem/show', { problemId });
}

export async function getSolvedProblemIds(handle) {
  const ids = new Set();
  let page = 1;
  while (page <= 20) {
    const result = await solvedFetch('/search/problem', {
      query: `solved_by:${handle}`,
      page,
      sort: 'id',
      direction: 'asc'
    });
    for (const item of result.items || []) {
      ids.add(item.problemId);
    }
    if (ids.size >= result.count || !result.items?.length) break;
    page++;
  }
  return ids;
}

export async function getSearchSuggestions(query) {
  const result = await solvedFetch('/search/suggestion', { query });
  return Array.isArray(result.autocomplete) ? result.autocomplete : [];
}

function pickDisplayName(displayNames, language) {
  const found = (displayNames || []).find((x) => x.language === language);
  return found?.name || '';
}

export async function getTagCatalog(options = {}) {
  const { force = false, maxPages = 8 } = options;
  if (!force && tagCatalogCache) {
    return tagCatalogCache;
  }

  const allItems = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await solvedFetch('/tag/list', { page });
    const items = Array.isArray(result.items) ? result.items : [];
    allItems.push(...items);

    if (allItems.length >= Number(result.count || 0) || items.length === 0) {
      break;
    }
  }

  tagCatalogCache = allItems
    .map((item) => {
      const key = String(item.key || '').trim();
      if (!key) return null;
      const ko = pickDisplayName(item.displayNames, 'ko');
      const en = pickDisplayName(item.displayNames, 'en');
      const problemCount = Number(item.problemCount || 0);
      const label = ko
        ? `${ko} (${key}) · ${problemCount.toLocaleString()}`
        : `${key} · ${problemCount.toLocaleString()}`;

      return {
        key,
        query: `tag:${key}`,
        label,
        ko,
        en,
        problemCount
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.problemCount - a.problemCount);

  return tagCatalogCache;
}

function normalizeSourceSuggestion(entry) {
  const caption = String(entry?.caption || '').trim();
  if (!caption.startsWith('/') || caption === '/') {
    return null;
  }

  const description = String(entry?.description || '').trim();
  const label = description ? `${caption} · ${description}` : caption;
  return {
    query: caption,
    label,
    description
  };
}

export async function getSourceCatalog(options = {}) {
  const { force = false } = options;
  if (!force && sourceCatalogCache) {
    return sourceCatalogCache;
  }

  const rootSuggestions = await getSearchSuggestions('/');
  const seedPrefixes = new Set(['/']);

  for (const entry of rootSuggestions) {
    const caption = String(entry?.caption || '').trim();
    if (caption.startsWith('/') && caption !== '/') {
      seedPrefixes.add(caption);
    }
  }

  const sourceMap = new Map();
  for (const prefix of seedPrefixes) {
    const suggestions = await getSearchSuggestions(prefix);
    for (const suggestion of suggestions) {
      const normalized = normalizeSourceSuggestion(suggestion);
      if (!normalized) continue;
      sourceMap.set(normalized.query, normalized);
    }
  }

  if (sourceMap.size === 0) {
    for (const fallback of ['/icpc', '/regionals', '/olympiad', '/univ']) {
      sourceMap.set(fallback, { query: fallback, label: fallback, description: '' });
    }
  }

  sourceCatalogCache = [...sourceMap.values()].sort((a, b) => a.query.localeCompare(b.query));
  return sourceCatalogCache;
}
