import { ScriptWord } from './scriptTokenizer';

/**
 * Computes Levenshtein edit distance between two normalized strings.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

/**
 * Similarity score in [0, 1] between a spoken word and a target script word.
 * Accounts for exact matches, prefix matches (common in interim ASR),
 * and phonetic/typo Levenshtein proximity.
 */
export function wordSimilarity(spoken: string, target: string): number {
  if (!spoken || !target) return 0;
  if (spoken === target) return 1;

  // Short words (1-2 chars like "e", "a", "de", "no") must match exactly
  if (target.length <= 2 || spoken.length <= 2) {
    return 0;
  }

  // Prefix match helps when ASR outputs singular/plural or partial word in interim results
  if (
    (spoken.length >= 3 && target.startsWith(spoken) && spoken.length / target.length >= 0.65) ||
    (target.length >= 3 && spoken.startsWith(target) && target.length / spoken.length >= 0.65)
  ) {
    return 0.88;
  }

  const maxLen = Math.max(spoken.length, target.length);
  const dist = levenshtein(spoken, target);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Advances the active word index in the script given a sequence of recent spoken words.
 *
 * Strategy:
 * - Looks ahead from `currentActiveIndex + 1` up to `MAX_LOOKAHEAD` words.
 * - Prefers immediate next words (offset 0 or 1) with gentle fuzzy tolerance.
 * - Requires stronger evidence (longer unique word or 2-word bigram match)
 *   to jump further ahead, preventing false jumps on common Portuguese connectors
 *   like "de", "que", "para", "uma".
 */
export function matchSpokenWords(
  scriptWords: ScriptWord[],
  currentActiveIndex: number,
  recentSpokenWords: string[]
): number {
  if (scriptWords.length === 0 || recentSpokenWords.length === 0) {
    return currentActiveIndex;
  }

  let active = currentActiveIndex;
  const MAX_LOOKAHEAD = 10;

  // Process the tail of spoken words sequentially
  for (let sIdx = 0; sIdx < recentSpokenWords.length; sIdx++) {
    const spoken = recentSpokenWords[sIdx];
    const prevSpoken = sIdx > 0 ? recentSpokenWords[sIdx - 1] : null;
    if (!spoken) continue;

    // Skip over purely punctuation-only tokens in the script
    let startSearch = active + 1;
    while (startSearch < scriptWords.length && scriptWords[startSearch].normalized === '') {
      startSearch++;
    }

    if (startSearch >= scriptWords.length) break;

    const endSearch = Math.min(scriptWords.length - 1, startSearch + MAX_LOOKAHEAD);
    let matchedIndex = -1;

    for (let idx = startSearch; idx <= endSearch; idx++) {
      const target = scriptWords[idx].normalized;
      if (!target) continue;

      const offset = idx - startSearch;
      const sim = wordSimilarity(spoken, target);

      if (offset === 0) {
        // Immediate next word: ultra-responsive prefix + fuzzy matching
        // Snaps as soon as interim ASR emits the start of the word
        const fastPrefix =
          spoken.length >= 2 &&
          target.length >= 3 &&
          (target.startsWith(spoken) || spoken.startsWith(target));

        if (fastPrefix || sim >= 0.62) {
          matchedIndex = idx;
          break;
        }
      } else if (offset === 1) {
        // 1 word skipped (e.g., ASR missed "a", "o", "de", "e")
        const prevScriptTarget = scriptWords[idx - 1]?.normalized ?? '';
        const skippedIsShort = prevScriptTarget.length <= 3;

        if ((skippedIsShort && sim >= 0.72) || (target.length >= 3 && sim >= 0.8)) {
          matchedIndex = idx;
          break;
        }
      } else if (offset <= 4) {
        // 2-4 words ahead: accept bigram match or strong match on a substantive word
        const prevTarget = scriptWords[idx - 1]?.normalized ?? '';
        const bigramMatch =
          prevSpoken !== null &&
          prevTarget.length > 0 &&
          wordSimilarity(prevSpoken, prevTarget) >= 0.72 &&
          sim >= 0.72;

        if (bigramMatch || (target.length >= 5 && sim >= 0.84)) {
          matchedIndex = idx;
          break;
        }
      } else {
        // 5-10 words ahead (e.g., speaker improvised and jumped back into script):
        // Require a confident bigram match or a very strong long-word match
        const prevTarget = scriptWords[idx - 1]?.normalized ?? '';
        const bigramMatch =
          prevSpoken !== null &&
          prevTarget.length >= 2 &&
          wordSimilarity(prevSpoken, prevTarget) >= 0.78 &&
          sim >= 0.78;

        if (bigramMatch || (target.length >= 7 && sim >= 0.9)) {
          matchedIndex = idx;
          break;
        }
      }
    }

    if (matchedIndex !== -1) {
      active = matchedIndex;
    }
  }

  return active;
}
