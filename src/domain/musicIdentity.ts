export function stripTrackPrefix(value: string) {
  return value.replace(/^\s*(?:(?:\d{1,2}[.-])?\d{1,3}\s*[-._]\s*|\d{1,3}\s+-\s+)/u, '').trim();
}
export function inferFileMetadata(fileName: string): { title: string; artist?: string } {
  const stem = stripTrackPrefix(fileName.replace(/\.[^.]+$/u, '').replace(/_+[–—-]_+/gu, ' - '));
  const parts = stem.split(/\s+[–—-]\s+/u);
  if (parts.length !== 2 || !parts.every((p) => p.trim()))
    return { title: stem.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() };
  return { artist: parts[0].trim().replace(/_/g, ' '), title: parts[1].trim().replace(/_/g, ' ') };
}
export const searchText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function matchesSearch(value: string, query: string) {
  const text = searchText(value);
  return searchText(query)
    .split(/\s+/u)
    .filter(Boolean)
    .every((part) => text.includes(part));
}
