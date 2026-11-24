/**
 * Parse a load typed as VA or watts ("4500", "4,500 VA", "4500 W") or as
 * kilowatts ("4.5 kW", "4.5kw", "4.5 k", "4.5 kVA"). Returns whole VA, or null
 * if the text isn't a load. For resistive appliances 1 kW = 1,000 VA.
 */
export function parseLoad(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '');
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?|\.\d+)(kva|kw|k|va|w)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.round(m[2]?.startsWith('k') ? n * 1000 : n);
}

/** True if the text is in kilowatts, so the field can show what it converts to. */
export const isKiloText = (text: string): boolean => /k(va|w)?\s*$/i.test(text.trim());
