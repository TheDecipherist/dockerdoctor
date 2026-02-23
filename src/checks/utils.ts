/**
 * Normalize JSON-stringified args from docker-file-parser back to
 * the plain string format that check regexes expect.
 *
 * COPY [".", "."] → ". ."
 * ENV {"KEY":"val"} → "KEY=val"
 * ARG ["KEY=val"] → "KEY=val"
 */
export function normalizeArgs(args: string): string {
  const trimmed = args.trim();

  // Try to parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return trimmed; // Already a plain string
  }

  // Arrays (COPY, ADD, ARG): join with spaces
  if (Array.isArray(parsed)) {
    return parsed.join(' ');
  }

  // Objects (ENV): convert {KEY: "val", KEY2: "val2"} → "KEY=val KEY2=val2"
  if (typeof parsed === 'object' && parsed !== null) {
    return Object.entries(parsed)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
  }

  return trimmed;
}
