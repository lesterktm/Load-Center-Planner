import type { BreakerFamilyId, BreakerForm, Protection } from '../core/types';

/**
 * Breaker product lines and their catalog-number patterns.
 *
 * Standard 1- and 2-pole patterns are well established. Specialty breakers
 * (AFCI, GFCI, dual-function, GFEP, tandems outside 15/20 A) vary by
 * generation, plug-on-neutral vs pigtail and region, so they are flagged
 * `verify: true`. Contributions with verified catalog data are welcome.
 */

export interface BreakerSpec {
  form: BreakerForm;
  protection: Protection;
  /** One rating per circuit. */
  amps: number[];
}

export interface PartSuggestion {
  partNumber: string | null;
  /** True when the part number should be confirmed against the manufacturer's catalog. */
  verify: boolean;
}

export interface BreakerFamily {
  id: BreakerFamilyId;
  brand: string;
  series: string;
  label: string;
  partNumber(spec: BreakerSpec): PartSuggestion;
}

type PolePattern = (poles: number, amps: number) => string;

interface Patterns {
  standard?: PolePattern;
  afci?: PolePattern;
  gfci?: PolePattern;
  df?: PolePattern;
  gfep?: PolePattern;
  tandem?: (a: number, b: number) => string;
}

function family(id: BreakerFamilyId, brand: string, series: string, pat: Patterns | null): BreakerFamily {
  return {
    id,
    brand,
    series,
    label: series ? `${brand} ${series}` : brand,
    partNumber({ form, protection, amps }) {
      if (!pat) return { partNumber: null, verify: false };
      const [a, b] = amps;
      if (form === 'single' || form === 'double') {
        const poles = form === 'single' ? 1 : 2;
        const fn = pat[protection];
        if (!fn) return { partNumber: null, verify: true };
        const common = protection === 'standard' && (poles === 1 ? a <= 30 : a <= 100);
        return { partNumber: fn(poles, a), verify: !common };
      }
      if (form === 'tandem' && protection === 'standard' && pat.tandem && b != null) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return { partNumber: pat.tandem(lo, hi), verify: !(lo >= 15 && hi <= 20) };
      }
      return { partNumber: null, verify: true };
    },
  };
}

export const FAMILIES: readonly BreakerFamily[] = [
  family('generic', 'Generic', '', null),
  family('sqd-hom', 'Square D', 'Homeline', {
    standard: (p, a) => `HOM${p}${a}`,
    afci: (p, a) => `HOM${p}${a}CAFI`,
    gfci: (p, a) => `HOM${p}${a}GFI`,
    df: (p, a) => `HOM${p}${a}DF`,
    gfep: (p, a) => `HOM${p}${a}EPD`,
    tandem: (a, b) => `HOMT${a}${b}`,
  }),
  family('sqd-qo', 'Square D', 'QO', {
    standard: (p, a) => `QO${p}${a}`,
    afci: (p, a) => `QO${p}${a}CAFI`,
    gfci: (p, a) => `QO${p}${a}GFI`,
    df: (p, a) => `QO${p}${a}DF`,
    gfep: (p, a) => `QO${p}${a}EPD`,
    tandem: (a, b) => `QOT${a}${b}`,
  }),
  family('eaton-br', 'Eaton', 'BR', {
    standard: (p, a) => `BR${p}${a}`,
    afci: (p, a) => `BRCAF${p}${a}`,
    gfci: (p, a) => `GFTCB${p}${a}`,
    tandem: (a, b) => `BD${a}${b}`,
  }),
  family('eaton-ch', 'Eaton', 'CH', {
    standard: (p, a) => `CH${p}${a}`,
  }),
  family('siemens-qp', 'Siemens', 'QP', {
    standard: (p, a) => `Q${p}${a}`,
    afci: (p, a) => `QA${p}${a}AFC`,
    gfci: (p, a) => `QF${p}${a}A`,
    tandem: (a, b) => `Q${a}${b}`,
  }),
  family('ge-thql', 'GE', 'THQL', {
    standard: (p, a) => `THQL${p}1${a}`,
    afci: (p, a) => `THQL${p}1${a}AF2`,
    gfci: (p, a) => `THQL${p}1${a}GFT`,
    df: (p, a) => `THQL${p}1${a}DF2`,
  }),
];

export function getFamily(id: BreakerFamilyId): BreakerFamily {
  return FAMILIES.find((f) => f.id === id) ?? FAMILIES[0];
}
