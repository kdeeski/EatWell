const DEFAULT_WINE_SITE = 'goodpairdays.com';

export function getGrapeSearchUrl(varietal: string, site?: string): string {
  const domain = (site || DEFAULT_WINE_SITE).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://www.google.com/search?q=${encodeURIComponent(varietal + ' site:' + domain)}`;
}
