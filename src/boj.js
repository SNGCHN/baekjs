const BOJ_PROBLEM_URL = 'https://www.acmicpc.net/problem/';

export class ProviderError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.cause = cause;
  }
}

const HTML_ENTITIES = {
  lt: '<', gt: '>', amp: '&', nbsp: ' ', quot: '"', apos: "'",
  // math operators
  times: '×', divide: '÷', minus: '−', plusmn: '±',
  le: '≤', ge: '≥', ne: '≠', asymp: '≈', equiv: '≡',
  sum: '∑', prod: '∏', infin: '∞', radic: '√',
  lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
  // greek
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
  epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ',
  sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω',
  Sigma: 'Σ', Pi: 'Π', Omega: 'Ω', Delta: 'Δ', Theta: 'Θ',
  // arrows & logic
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔',
  lArr: '⇐', rArr: '⇒', hArr: '⇔',
  forall: '∀', exist: '∃', isin: '∈', notin: '∉',
  sub: '⊂', sup: '⊃', sube: '⊆', supe: '⊇',
  cap: '∩', cup: '∪', and: '∧', or: '∨', not: '¬',
  // misc symbols
  hellip: '…', middot: '·', bull: '•',
  ndash: '–', mdash: '—',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  prime: '′', Prime: '″', deg: '°',
  cent: '¢', pound: '£', yen: '¥', euro: '€',
  copy: '©', reg: '®', trade: '™',
  permil: '‰', micro: 'µ', para: '¶', sect: '§',
  sup1: '¹', sup2: '²', sup3: '³',
  frac12: '½', frac14: '¼', frac34: '¾',
  empty: '∅', nabla: '∇', part: '∂', prop: '∝',
  oplus: '⊕', otimes: '⊗', perp: '⊥',
  loz: '◊', spades: '♠', clubs: '♣', hearts: '♥', diams: '♦',
};

function decodeHtml(value) {
  return String(value)
    .replace(/&([a-zA-Z]+);/g, (full, name) => HTML_ENTITIES[name] ?? full)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    );
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSampleText(value) {
  const decoded = decodeHtml(String(value).replace(/\r\n/g, '\n').replace(/<br\s*\/?>/gi, '\n'));
  return decoded.replace(/^\n/, '').trimEnd();
}

function collectPreById(html, idPrefix) {
  const map = new Map();
  const escapedPrefix = escapeRegex(idPrefix);
  const regex = new RegExp(
    `<pre[^>]*class=["'][^"']*sampledata[^"']*["'][^>]*id\\s*=\\s*["']${escapedPrefix}-(\\d+)["'][^>]*>([\\s\\S]*?)<\\/pre>`,
    'gi'
  );

  let match = regex.exec(html);
  while (match) {
    const index = Number(match[1]);
    const text = normalizeSampleText(match[2]);
    map.set(index, text);
    match = regex.exec(html);
  }

  return map;
}

function parseSampleSections(html) {
  const inputs = collectPreById(html, 'sample-input');
  const outputs = collectPreById(html, 'sample-output');

  if (inputs.size === 0 || outputs.size === 0) {
    const sectionRegex =
      /<section[^>]*id\s*=\s*["']sample(input|output)(\d+)["'][^>]*>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/gi;
    let match = sectionRegex.exec(html);

    while (match) {
      const type = match[1];
      const index = Number(match[2]);
      const text = normalizeSampleText(match[3]);

      if (type === 'input' && !inputs.has(index)) {
        inputs.set(index, text);
      }
      if (type === 'output' && !outputs.has(index)) {
        outputs.set(index, text);
      }

      match = sectionRegex.exec(html);
    }
  }

  const indices = [...inputs.keys()].filter((idx) => outputs.has(idx)).sort((a, b) => a - b);
  return indices.map((idx) => ({ id: idx, input: inputs.get(idx), output: outputs.get(idx) }));
}

function stripTags(value) {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '');
}

function normalizeSectionText(value) {
  const text = decodeHtml(
    stripTags(
      String(value)
        .replace(/\r\n/g, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
    )
  );

  return text
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripLeadingHeading(text, heading) {
  if (!text) return '';
  const lines = String(text).split('\n');
  if (lines[0]?.trim() === heading) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

function stripKnownHeading(text) {
  const lines = String(text || '').split('\n');
  const first = lines[0]?.trim();
  const headingSet = new Set([
    '\uBB38\uC81C', // 문제
    '\uC785\uB825', // 입력
    '\uCD9C\uB825', // 출력
    'Problem',
    'Input',
    'Output'
  ]);

  if (first && headingSet.has(first)) {
    lines.shift();
  }

  return lines.join('\n').trim();
}

function extractElementById(html, elementId) {
  const escapedId = escapeRegex(elementId);

  const sectionRegex = new RegExp(
    `<section[^>]*id\\s*=\\s*["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/section>`,
    'i'
  );
  const sectionMatch = html.match(sectionRegex);
  if (sectionMatch) {
    return sectionMatch[1];
  }

  const elementRegex = new RegExp(
    `<([a-z0-9]+)[^>]*id\\s*=\\s*["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i'
  );
  const elementMatch = html.match(elementRegex);
  if (elementMatch) {
    return elementMatch[2];
  }

  return '';
}

function parseProblemContent(html) {
  const descriptionRaw = normalizeSectionText(extractElementById(html, 'problem_description'));
  const inputRaw = normalizeSectionText(extractElementById(html, 'problem_input'));
  const outputRaw = normalizeSectionText(extractElementById(html, 'problem_output'));

  return {
    description: stripKnownHeading(stripLeadingHeading(descriptionRaw, '\uBB38\uC81C')),
    input: stripKnownHeading(stripLeadingHeading(inputRaw, '\uC785\uB825')),
    output: stripKnownHeading(stripLeadingHeading(outputRaw, '\uCD9C\uB825'))
  };
}

async function fetchProblemHtml(problemId, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BOJ_PROBLEM_URL}${problemId}`, {
      method: 'GET',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: controller.signal
    });

    if (response.status === 429) {
      throw new ProviderError('RATE_LIMIT', 'Rate limit reached while requesting BOJ.');
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        'AUTH',
        `BOJ denied access with status ${response.status}. Use --from-cache or --from-file.`
      );
    }

    if (!response.ok) {
      throw new ProviderError(
        'NETWORK',
        `Failed to fetch BOJ problem page. status=${response.status}`
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }

    if (error.name === 'AbortError') {
      throw new ProviderError('NETWORK', `Request timeout after ${timeoutMs}ms`, error);
    }

    throw new ProviderError('NETWORK', error.message || 'Unknown network error', error);
  } finally {
    clearTimeout(timer);
  }
}

export async function getSamples(problemId, timeoutMs = 6000) {
  const html = await fetchProblemHtml(problemId, timeoutMs);
  const samples = parseSampleSections(html);

  if (samples.length === 0) {
    throw new ProviderError(
      'PARSING',
      'Sample inputs/outputs were not found on BOJ page.'
    );
  }

  return samples;
}

export async function getProblemContent(problemId, timeoutMs = 6000) {
  const html = await fetchProblemHtml(problemId, timeoutMs);
  const content = parseProblemContent(html);

  if (!content.description && !content.input && !content.output) {
    throw new ProviderError(
      'PARSING',
      'Problem description/input/output were not found on BOJ page.'
    );
  }

  return content;
}
