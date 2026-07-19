// Encodes a "full review session" - an ordered walk through several Smart
// Review queue items in one sitting - as a plain query string, rather than
// a database row. A session is nothing more than the list of
// question/choice pairs it points to plus a position, so there's nothing to
// clean up if it's abandoned halfway and nothing to migrate later; it's
// disposable state that lives entirely in the URL for as long as the
// student is actively clicking "Next concept."

export interface SessionQueueItem {
  questionId: string;
  choiceId: string;
}

// qbank_questions.id is a Supabase uuid (contains hyphens) and choice ids
// come from newQBankId() (plain alphanumeric) - colon/comma are safe
// separators for both.
export function encodeSessionQueue(items: SessionQueueItem[]): string {
  return items.map((i) => `${i.questionId}:${i.choiceId}`).join(",");
}

export function decodeSessionQueue(raw: string | undefined | null): SessionQueueItem[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => {
      const [questionId, choiceId] = pair.split(":");
      return questionId && choiceId ? { questionId, choiceId } : null;
    })
    .filter((x): x is SessionQueueItem => !!x);
}

/**
 * Builds the URL for a given position in an encoded session queue, or null
 * if that position is out of range (i.e. the session is over).
 */
export function sessionHrefAt(encodedQueue: string, pos: number): string | null {
  const items = decodeSessionQueue(encodedQueue);
  const item = items[pos];
  if (!item) return null;
  return `/error-notes/practice/${item.questionId}/${item.choiceId}?session=${encodeURIComponent(
    encodedQueue
  )}&pos=${pos}`;
}
