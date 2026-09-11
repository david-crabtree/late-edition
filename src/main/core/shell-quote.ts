/**
 * Quote a string so a POSIX shell reads it as one argument.
 *
 * This exists because of a path: the default newsroom on macOS lives under
 * `~/Library/Application Support/late-edition/newsroom`. Terminal.app starts its own shell,
 * so the directory has to be written into the command text rather than passed as an option
 * — and unquoted, zsh read that space as an argument separator and `cd` failed before the
 * command the terminal was opened for ever ran.
 *
 * Single quotes are the only form a POSIX shell treats as fully literal: no variable
 * expansion, no backslash escapes, nothing. The one character that cannot appear inside
 * them is a single quote, which is closed, escaped outside, and reopened.
 */
export function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
