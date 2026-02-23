import { execSync } from 'node:child_process';

/**
 * Copy text to the system clipboard using platform-appropriate commands.
 * Returns true on success, false if no clipboard tool is available.
 */
export function copyToClipboard(text: string): boolean {
  const cmds =
    process.platform === 'darwin'
      ? ['pbcopy']
      : process.platform === 'win32'
        ? ['clip']
        : [
            'clip.exe',
            '/mnt/c/Windows/System32/clip.exe',
            'xclip -selection clipboard',
            'xsel --clipboard --input',
            'wl-copy',
          ];

  for (const cmd of cmds) {
    try {
      execSync(cmd, { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

const FENCE_RE = /^\s*```/;

/**
 * Extract clean, pasteable code blocks from instruction text.
 *
 * Handles two formats:
 * 1. Fenced blocks (```yaml ... ```)
 * 2. Indented blocks (lines starting with whitespace)
 *
 * Each block is dedented to its minimum indent level.
 * Blocks are joined with blank lines between them.
 */
export function extractCodeBlocks(text: string): string {
  const lines = text.split('\n');
  const blocks: string[][] = [];
  let current: string[] = [];
  let inFence = false;

  const flushBlock = () => {
    // Trim trailing empty lines
    while (current.length > 0 && !current[current.length - 1].trim()) {
      current.pop();
    }
    if (current.length > 0) {
      blocks.push(current);
    }
    current = [];
  };

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      if (inFence) {
        // Closing fence — flush the fenced block
        flushBlock();
      }
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      // Inside a fenced block — collect all lines
      current.push(line);
    } else if (/^\s/.test(line) && line.trim()) {
      // Indented non-empty line — code
      current.push(line);
    } else if (!line.trim()) {
      // Empty line — keep it if we're in a code block
      if (current.length > 0) {
        current.push(line);
      }
    } else {
      // Prose line (column 0, non-empty) — split blocks
      flushBlock();
    }
  }

  // Flush any remaining block
  flushBlock();

  // Dedent each block
  const dedented = blocks.map((block) => {
    const minIndent = block.reduce((min, l) => {
      if (!l.trim()) return min;
      const indent = l.match(/^(\s*)/)?.[1].length ?? 0;
      return Math.min(min, indent);
    }, Infinity);

    const shift = minIndent === Infinity ? 0 : minIndent;
    return block.map((l) => (l.trim() ? l.slice(shift) : l)).join('\n');
  });

  return dedented.join('\n\n');
}
