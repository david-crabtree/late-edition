/**
 * Best-effort extraction of a single JSON object from model text. Handles markdown
 * fences and leading/trailing prose by locating the outermost balanced braces.
 * Throws if nothing parseable is found — callers may then retry with the error.
 */
export function extractJson<T = unknown>(text: string): T {
  const cleaned = stripFences(text).trim();
  // Fast path.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through to brace-matching
  }
  const candidate = outermostObject(cleaned);
  if (candidate) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // fall through
    }
  }
  throw new Error(
    `No parseable JSON object found in output (first 200 chars): ${cleaned.slice(0, 200)}`,
  );
}

function stripFences(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence?.[1] ?? text;
}

/** Return the substring from the first `{` to its matching `}` (brace-aware, string-aware). */
function outermostObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}
