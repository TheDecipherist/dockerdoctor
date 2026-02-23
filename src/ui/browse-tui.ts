import readline from 'node:readline';
import { basename } from 'node:path';
import type { CheckCategory, CheckResult, Report, Severity } from '../types/index.js';
import { copyToClipboard, extractCodeBlocks } from './clipboard.js';

// ── ANSI escape helpers ─────────────────────────────────────────────────────

const CSI = '\x1b[';

const ansi = {
  clear: `${CSI}2J${CSI}H`,
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  inverse: `${CSI}7m`,
  red: `${CSI}31m`,
  green: `${CSI}32m`,
  yellow: `${CSI}33m`,
  blue: `${CSI}34m`,
  brightWhite: `${CSI}97m`,
  bgCyan: `${CSI}46m`,
  black: `${CSI}30m`,
};

function moveTo(row: number, col: number): string {
  return `${CSI}${row};${col}H`;
}

function sevColor(s: Severity): string {
  return s === 'error' ? ansi.red : s === 'warning' ? ansi.yellow : ansi.blue;
}

function sevIcon(s: Severity): string {
  return s === 'error' ? 'x' : s === 'warning' ? '!' : 'i';
}

function sevLabel(s: Severity): string {
  return s === 'error' ? 'Errors' : s === 'warning' ? 'Warnings' : 'Info';
}

// ── String utilities ────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function strip(str: string): string {
  return str.replace(ANSI_RE, '');
}

function vLen(str: string): number {
  return strip(str).length;
}

function truncate(str: string, w: number): string {
  const plain = strip(str);
  if (plain.length <= w) return str;
  return plain.substring(0, w - 1) + '\u2026';
}

function pad(str: string, w: number): string {
  const len = vLen(str);
  if (len >= w) return truncate(str, w) + ansi.reset;
  return str + ansi.reset + ' '.repeat(w - len);
}

function center(str: string, w: number): string {
  const len = vLen(str);
  if (len >= w) return str;
  const l = Math.floor((w - len) / 2);
  return ' '.repeat(l) + str + ' '.repeat(w - len - l);
}

function wrap(text: string, w: number): string[] {
  if (w <= 0) return [''];
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (!para) { lines.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if (line && line.length + 1 + word.length > w) {
        lines.push(line);
        line = word.length > w ? word.substring(0, w) : word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

// ── State ───────────────────────────────────────────────────────────────────

type Screen = 'main' | 'results';

interface Category {
  severity: Severity;
  results: CheckResult[];
}

interface State {
  screen: Screen;
  catIdx: number;
  resIdx: number;
  resScroll: number;
  detailScroll: number;
  cats: Category[];
  scanDir: string;
  checkScope: string;
  flash: string;
}

// ── YAML / code highlighting ────────────────────────────────────────────────

function highlightYamlValue(value: string): string {
  const v = value.trim();
  if (!v) return value;
  if (/^["'].*["']$/.test(v)) return `${ansi.green}${value}${ansi.reset}`;
  if (/^\d+(\.\d+)?(s|m|ms|h|d|g|mb|gb|k|kb)?$/i.test(v)) return `${ansi.yellow}${value}${ansi.reset}`;
  if (/^(true|false)$/i.test(v)) return `${ansi.yellow}${value}${ansi.reset}`;
  if (/^\[.*\]$/.test(v)) return `${ansi.green}${value}${ansi.reset}`;
  return value;
}

function highlightYaml(line: string): string {
  // Comment line
  if (/^\s*#/.test(line)) return `${ansi.dim}${line}${ansi.reset}`;
  // Key: value
  const kvMatch = line.match(/^(\s*)([\w.-]+)(\s*:\s*)(.*)/);
  if (kvMatch) {
    const [, indent, key, colon, val] = kvMatch;
    return `${indent}${ansi.blue}${key}${ansi.reset}${ansi.dim}${colon}${ansi.reset}${highlightYamlValue(val)}`;
  }
  // List item
  const listMatch = line.match(/^(\s*-\s+)(.*)/);
  if (listMatch) {
    const [, dash, val] = listMatch;
    return `${ansi.dim}${dash}${ansi.reset}${highlightYamlValue(val)}`;
  }
  return line;
}

function formatInstructions(text: string, width: number): string[] {
  const lines: string[] = [];
  let inFence = false;
  for (const raw of text.split('\n')) {
    // Toggle fence state on ``` markers — skip the marker itself
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (!raw.trim()) {
      lines.push('');
    } else if (inFence || /^\s/.test(raw)) {
      // Code/YAML line — preserve indentation, apply highlighting, truncate if needed
      const highlighted = highlightYaml(raw);
      lines.push(strip(highlighted).length > width ? truncate(highlighted, width) : highlighted);
    } else {
      // Prose line — word-wrap normally
      lines.push(...wrap(raw, width));
    }
  }
  return lines.length ? lines : [''];
}

// ── Detail builder ──────────────────────────────────────────────────────────

function buildDetail(result: CheckResult, width: number): string[] {
  const c = sevColor(result.severity);
  const lines: string[] = [];

  lines.push(`${c}${ansi.bold}${sevIcon(result.severity)} ${result.title}${ansi.reset}`);
  lines.push(`${ansi.dim}[${result.id}]${ansi.reset}`);
  lines.push('');

  lines.push(`${ansi.dim}Category:${ansi.reset} ${result.category}`);
  if (result.location) {
    const loc = result.line ? `${result.location}:${result.line}` : result.location;
    lines.push(`${ansi.dim}Location:${ansi.reset} ${loc}`);
  }
  lines.push('');

  lines.push(`${ansi.bold}Description${ansi.reset}`);
  lines.push(...wrap(result.message, width));
  lines.push('');

  if (result.fixes.length > 0) {
    lines.push(`${ansi.bold}Fixes${ansi.reset}`);
    lines.push('');
    for (const fix of result.fixes) {
      const tag = fix.type === 'auto'
        ? `${ansi.green}[auto]${ansi.reset}`
        : `${ansi.dim}[manual]${ansi.reset}`;
      lines.push(`${tag} ${fix.description}`);
      if (fix.instructions) {
        lines.push('');
        lines.push(...formatInstructions(fix.instructions, width - 2).map((l) => `  ${l}`));
      }
      lines.push('');
    }
  }

  return lines;
}

// ── Rendering ───────────────────────────────────────────────────────────────

function render(state: State): void {
  const w = process.stdout.columns || 80;
  const h = process.stdout.rows || 24;
  const leftW = Math.min(Math.floor(w * 0.38), 50);
  const rightW = w - leftW - 1; // 1 for separator
  const bodyH = h - 4; // header, sub-header, divider, footer

  let o = ansi.clear;

  // Header — row 1: title bar, row 2: directory + scope
  const title = state.screen === 'main'
    ? ' Browse Results '
    : ` ${sevLabel(state.cats[state.catIdx].severity)} (${state.cats[state.catIdx].results.length}) `;
  o += moveTo(1, 1) + ansi.bgCyan + ansi.black + center(title, w) + ansi.reset;

  // Sub-header: directory and check scope
  const dirLabel = `${ansi.dim}Dir:${ansi.reset} ${state.scanDir}`;
  const scopeLabel = `${ansi.dim}Scan:${ansi.reset} ${state.checkScope}`;
  const subHeader = ` ${dirLabel}  ${scopeLabel}`;
  o += moveTo(2, 1) + pad(subHeader, w);

  // Divider
  o += moveTo(3, 1) + ansi.dim + '\u2500'.repeat(leftW) + '\u252c' + '\u2500'.repeat(w - leftW - 1) + ansi.reset;

  // Body
  o += state.screen === 'main'
    ? renderMain(state, leftW, rightW, bodyH)
    : renderResults(state, leftW, rightW, bodyH);

  // Footer
  o += moveTo(h, 1);
  if (state.flash) {
    o += `${ansi.green}${pad(` \u2713 ${state.flash}`, w)}${ansi.reset}`;
  } else {
    o += ansi.dim;
    o += state.screen === 'main'
      ? pad(' \u2191\u2193 Navigate  Enter: Open  q: Exit', w)
      : pad(' \u2191\u2193 Navigate  \u2190/q: Back  Shift+\u2191\u2193: Scroll  c: Copy fix', w);
  }
  o += ansi.reset;

  process.stdout.write(o);
}

function renderMain(state: State, leftW: number, rightW: number, bodyH: number): string {
  let o = '';
  const selected = state.cats[state.catIdx];

  // Right-pane preview: list all results in selected category
  const preview: string[] = [];
  preview.push(`${ansi.bold}${sevLabel(selected.severity)}${ansi.reset}`);
  preview.push(`${ansi.dim}${selected.results.length} issue${selected.results.length !== 1 ? 's' : ''}${ansi.reset}`);
  preview.push('');
  for (const r of selected.results) {
    preview.push(`${sevColor(r.severity)}${sevIcon(r.severity)} ${r.title}${ansi.reset}`);
  }

  for (let row = 0; row < bodyH; row++) {
    o += moveTo(row + 4, 1);

    // Left: category list
    if (row < state.cats.length) {
      const cat = state.cats[row];
      const sel = row === state.catIdx;
      const label = `${sevIcon(cat.severity)} ${sevLabel(cat.severity)} (${cat.results.length})`;
      o += sel
        ? `${ansi.bold}${ansi.brightWhite}${pad(` \u25b8 ${label}`, leftW)}${ansi.reset}`
        : `${sevColor(cat.severity)}${pad(`   ${label}`, leftW)}${ansi.reset}`;
    } else {
      o += ' '.repeat(leftW);
    }

    // Separator
    o += `${ansi.dim}\u2502${ansi.reset}`;

    // Right: preview
    if (row < preview.length) {
      o += pad(` ${preview[row]}`, rightW);
    } else {
      o += ' '.repeat(rightW);
    }
  }

  return o;
}

function renderResults(state: State, leftW: number, rightW: number, bodyH: number): string {
  let o = '';
  const cat = state.cats[state.catIdx];
  const results = cat.results;

  // Keep selected visible
  if (state.resIdx < state.resScroll) state.resScroll = state.resIdx;
  if (state.resIdx >= state.resScroll + bodyH) state.resScroll = state.resIdx - bodyH + 1;

  // Detail for right pane
  const detail = buildDetail(results[state.resIdx], rightW - 2);
  const maxScroll = Math.max(0, detail.length - bodyH);
  if (state.detailScroll > maxScroll) state.detailScroll = maxScroll;

  for (let row = 0; row < bodyH; row++) {
    o += moveTo(row + 4, 1);

    // Left: result list
    const idx = row + state.resScroll;
    if (idx < results.length) {
      const r = results[idx];
      const sel = idx === state.resIdx;
      const label = `${sevIcon(r.severity)} ${truncate(r.title, leftW - 5)}`;
      o += sel
        ? `${ansi.bold}${ansi.brightWhite}${pad(` \u25b8 ${label}`, leftW)}${ansi.reset}`
        : `${sevColor(r.severity)}${pad(`   ${label}`, leftW)}${ansi.reset}`;
    } else {
      o += ' '.repeat(leftW);
    }

    // Separator
    o += `${ansi.dim}\u2502${ansi.reset}`;

    // Right: detail
    const dIdx = row + state.detailScroll;
    if (dIdx < detail.length) {
      o += pad(` ${detail[dIdx]}`, rightW);
    } else {
      o += ' '.repeat(rightW);
    }
  }

  return o;
}

// ── Input ───────────────────────────────────────────────────────────────────

/** Returns true when TUI should exit */
function handleKey(state: State, key: readline.Key): boolean {
  if (key.ctrl && key.name === 'c') return true;

  if (state.screen === 'main') {
    const max = state.cats.length - 1;
    switch (key.name) {
      case 'up': case 'k':
        state.catIdx = Math.max(0, state.catIdx - 1);
        break;
      case 'down': case 'j':
        state.catIdx = Math.min(max, state.catIdx + 1);
        break;
      case 'return': case 'right':
        state.screen = 'results';
        state.resIdx = 0;
        state.resScroll = 0;
        state.detailScroll = 0;
        break;
      case 'q': case 'escape':
        return true;
    }
  } else {
    const max = state.cats[state.catIdx].results.length - 1;
    if (key.name === 'q' || key.name === 'escape' || key.name === 'left' || key.name === 'backspace') {
      state.screen = 'main';
      return false;
    }
    switch (key.name) {
      case 'up':
        if (key.shift) {
          state.detailScroll = Math.max(0, state.detailScroll - 1);
        } else {
          state.resIdx = Math.max(0, state.resIdx - 1);
          state.detailScroll = 0;
        }
        break;
      case 'down':
        if (key.shift) {
          state.detailScroll++;
        } else {
          state.resIdx = Math.min(max, state.resIdx + 1);
          state.detailScroll = 0;
        }
        break;
      case 'k':
        state.resIdx = Math.max(0, state.resIdx - 1);
        state.detailScroll = 0;
        break;
      case 'j':
        state.resIdx = Math.min(max, state.resIdx + 1);
        state.detailScroll = 0;
        break;
      case 'pagedown':
        state.detailScroll += 5;
        break;
      case 'pageup':
        state.detailScroll = Math.max(0, state.detailScroll - 5);
        break;
    }
  }

  return false;
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function canUseTUI(): boolean {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  return cols >= 60 && rows >= 12;
}

const CHECK_SCOPE_LABELS: Record<string, string> = {
  dockerfile: 'Dockerfile',
  compose: 'Compose',
  secrets: 'Secrets',
  lineendings: 'Line Endings',
  dockerignore: 'Dockerignore',
  build: 'Build',
  startup: 'Startup',
  network: 'Network',
  performance: 'Performance',
  image: 'Image',
  cleanup: 'Cleanup',
};

export async function browseResultsTUI(
  report: Report,
  scanDir: string,
  categories?: CheckCategory[],
): Promise<void> {
  const { results, summary } = report;
  if (summary.total === 0) return;

  const errors = results.filter((r) => r.severity === 'error');
  const warnings = results.filter((r) => r.severity === 'warning');
  const infos = results.filter((r) => r.severity === 'info');

  const cats: Category[] = [];
  if (errors.length > 0) cats.push({ severity: 'error', results: errors });
  if (warnings.length > 0) cats.push({ severity: 'warning', results: warnings });
  if (infos.length > 0) cats.push({ severity: 'info', results: infos });
  if (cats.length === 0) return;

  const checkScope = categories
    ? categories.map((c) => CHECK_SCOPE_LABELS[c] || c).join(', ')
    : 'All checks';

  const state: State = {
    screen: 'main',
    catIdx: 0,
    resIdx: 0,
    resScroll: 0,
    detailScroll: 0,
    cats,
    scanDir,
    checkScope,
    flash: '',
  };

  const wasRaw = process.stdin.isRaw;
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(ansi.hideCursor);

  return new Promise<void>((resolve) => {
    let exited = false;

    const cleanup = () => {
      if (exited) return;
      exited = true;
      process.stdin.removeListener('keypress', onKey);
      process.stdout.removeListener('resize', onResize);
      process.stdout.write(ansi.showCursor + ansi.clear);
      process.stdin.setRawMode(wasRaw ?? false);
      resolve();
    };

    const onKey = (_str: string | undefined, key: readline.Key) => {
      if (!key) return;

      // Copy fix code examples to clipboard
      if (state.screen === 'results' && key.name === 'c' && !key.ctrl && !key.meta) {
        const result = state.cats[state.catIdx].results[state.resIdx];
        const text = result.fixes
          .filter((f) => f.instructions)
          .map((f) => f.instructions!)
          .join('\n\n');
        const code = extractCodeBlocks(text);
        if (code && copyToClipboard(code)) {
          state.flash = 'Copied to clipboard!';
        } else {
          state.flash = code ? 'Clipboard not available' : 'No fix instructions';
        }
        render(state);
        setTimeout(() => { state.flash = ''; if (!exited) render(state); }, 2000);
        return;
      }

      state.flash = '';
      if (handleKey(state, key)) { cleanup(); return; }
      render(state);
    };

    const onResize = () => { if (!exited) render(state); };

    process.stdin.on('keypress', onKey);
    process.stdout.on('resize', onResize);

    render(state);
  });
}
