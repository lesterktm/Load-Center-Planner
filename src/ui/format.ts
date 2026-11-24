export const fmt0 = (n: number): string => Math.round(n).toLocaleString('en-US');
export const fmt1 = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });

/** Hours as text: "45 min", "18.5 hours", "3.2 days". */
export function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${fmt1(h)} hours`;
  return `${fmt1(h / 24)} days`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
