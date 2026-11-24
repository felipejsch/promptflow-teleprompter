export interface ScriptWord {
  index: number;
  raw: string;
  normalized: string;
  paragraphIndex: number;
}

export interface ScriptParagraph {
  index: number;
  words: ScriptWord[];
}

export interface ParsedScript {
  paragraphs: ScriptParagraph[];
  words: ScriptWord[];
}

/**
 * Normalizes a word for speech-to-text comparison:
 * lowercase, removes diacritics (accents), and strips punctuation.
 */
export function normalizeWord(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Splits a raw transcript string into normalized spoken words.
 */
export function tokenizeTranscript(transcript: string): string[] {
  return transcript
    .trim()
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0);
}

/**
 * Parses a script into paragraphs and flat indexed words,
 * preserving punctuation and paragraph breaks for display.
 */
export function parseScript(text: string): ParsedScript {
  const rawParagraphs = text.split(/\n+/);
  const paragraphs: ScriptParagraph[] = [];
  const words: ScriptWord[] = [];
  let globalIndex = 0;

  rawParagraphs.forEach((paraText, pIdx) => {
    const trimmed = paraText.trim();
    if (!trimmed) return;

    const rawTokens = trimmed.split(/\s+/);
    const paraWords: ScriptWord[] = [];

    for (const raw of rawTokens) {
      if (!raw) continue;
      const word: ScriptWord = {
        index: globalIndex,
        raw,
        normalized: normalizeWord(raw),
        paragraphIndex: paragraphs.length,
      };
      paraWords.push(word);
      words.push(word);
      globalIndex++;
    }

    if (paraWords.length > 0) {
      paragraphs.push({
        index: pIdx,
        words: paraWords,
      });
    }
  });

  return { paragraphs, words };
}

/**
 * Estimates speaking duration in mm:ss format at a given WPM (default 135 WPM).
 */
export function estimateReadingTime(wordCount: number, wpm = 135): string {
  if (wordCount <= 0) return '0:00';
  const totalSeconds = Math.max(1, Math.round((wordCount / wpm) * 60));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
