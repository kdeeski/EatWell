export function getGrapeGuideUrl(varietal: string): string {
  const slug = varietal
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return `https://www.goodpairdays.com/guides/wine-grapes/article/${slug}/`;
}
