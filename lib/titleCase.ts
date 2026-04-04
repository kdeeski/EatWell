// UK English Title Case
// Capitalises all words except articles, conjunctions, and short prepositions
// unless they are the first or last word.

const LOWERCASE_WORDS = new Set([
  'a', 'an', 'the',
  'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'in', 'on', 'at', 'to', 'by', 'of', 'as', 'up',
  'with', 'via', 'vs', 'over', 'near', 'into', 'onto',
  'from', 'out', 'off', 'per',
]);

export function toTitleCase(str: string | null | undefined): string {
  if (!str) return str ?? '';
  const words = str.trim().split(/\s+/);
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i === 0 || i === words.length - 1) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return LOWERCASE_WORDS.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
