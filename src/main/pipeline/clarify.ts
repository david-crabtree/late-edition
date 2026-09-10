/**
 * Raised when the Chief reads a brief and decides it's too vague to act on. The run stops
 * before any expensive research, persists (so it's resumable), and surfaces the questions to
 * the user; answering with `run --resume <id> --answer "..."` folds the reply into the brief
 * and continues. This is the "agents ask instead of guessing" path.
 */
export class ClarificationNeededError extends Error {
  constructor(
    readonly editionId: string,
    readonly questions: string[],
  ) {
    super('The desk needs clarification before it can run this brief.');
    this.name = 'ClarificationNeededError';
  }
}
