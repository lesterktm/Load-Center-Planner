import type { BreakerForm, LoadType, Panel, Project, Protection } from './types';
import { getFamily, type BreakerFamily } from '../data/families';
import { PROTECTION_LABELS } from './labels';
import { formVolts } from './panel';
import { wireLabel, WIRE_SIZES } from './wire';
import { panelOrder } from './tree';
import { backfedBreakers, sourceName } from './generator';

export interface BomLine {
  key: string;
  qty: number;
  partNumber: string | null;
  description: string;
  verify: boolean;
}

export interface Bom {
  lines: BomLine[];
  /** Existing breakers left off the list. */
  existingBreakers: number;
  /** Existing panels left off the list. */
  existingPanels: number;
}

const FORM_TEXT: Record<BreakerForm, string> = {
  single: '1-pole',
  double: '2-pole',
  tandem: 'tandem (two 1-pole)',
  quad: 'quad (two 2-pole)',
};
const FORM_ORDER: Record<BreakerForm, number> = { single: 0, tandem: 1, double: 2, quad: 3 };

export function panelDescription(panel: Panel): string {
  const fam = getFamily(panel.family);
  const main = panel.mainType === 'main-breaker' ? `${panel.mainAmps ?? '?'} A main breaker` : 'main lugs';
  return `${fam.id === 'generic' ? 'Load center' : `${fam.label} load center`}, ${panel.busAmps} A bus, ${main}, ${panel.spaces} spaces / ${panel.maxCircuits} circuits, 120/240 V 1-phase`;
}

export function breakerDescription(fam: BreakerFamily, form: BreakerForm, protection: Protection, amps: number[]): string {
  const ampText = amps.map((a) => `${a} A`).join(' / ');
  const prot = protection === 'standard' ? '' : `, ${PROTECTION_LABELS[protection]}`;
  return `${fam.id === 'generic' ? 'Breaker' : `${fam.label} breaker`}, ${FORM_TEXT[form]} ${ampText}${prot}`;
}

/** What to buy: new panels, new breakers and generator interlock hardware. Existing equipment is left off. */
export function buildBom(p: Project): Bom {
  const panelLines: BomLine[] = [];
  const extras: BomLine[] = [];
  const groups = new Map<string, BomLine & { form: BreakerForm; sortAmps: number; family: string; moved: boolean }>();
  let existingBreakers = 0;
  let existingPanels = 0;
  // GFCI receptacles on new circuits, by rating and indoor/outdoor.
  const gfciRcpts = new Map<string, BomLine>();
  const tamperResistant = Number(p.necEdition) >= 2008;

  for (const panel of panelOrder(p)) {
    const fam = getFamily(panel.family);
    if (panel.status === 'new') {
      panelLines.push({
        key: `panel-${panel.id}`,
        qty: 1,
        partNumber: panel.catalogNumber.trim() || null,
        description: `${panel.name || 'Panel'}: ${panelDescription(panel)}`,
        verify: false,
      });
    } else {
      existingPanels++;
    }

    for (const b of panel.breakers) {
      // Existing circuits moving here from another panel need a breaker that fits this panel.
      const moved = b.status === 'existing' && !!b.movedFrom && b.movedFrom.panelId !== panel.id;
      if (b.status === 'existing' && !moved) {
        existingBreakers++;
        continue;
      }
      if (!moved && formVolts(b.form) === 120) {
        for (const c of b.circuits) {
          if (!c.gfciReceptacle || !c.servesReceptacles) continue;
          const rating = c.amps >= 20 ? 20 : 15;
          const outdoor = c.location === 'outdoor' || c.location === 'pool-spa';
          const key = `gfci-rcpt|${rating}|${outdoor ? 'wr' : 'in'}`;
          const line = gfciRcpts.get(key) ?? {
            key,
            qty: 0,
            partNumber: null,
            description:
              `GFCI receptacle, ${rating} A 125 V` +
              (tamperResistant ? ', tamper-resistant' : '') +
              (outdoor ? ', weather-resistant, with an in-use cover' : '') +
              ' (one at the start of each circuit marked "GFCI receptacle"; add more where outlets aren\'t wired after it)',
            verify: false,
          };
          line.qty++;
          gfciRcpts.set(key, line);
        }
      }
      let amps = b.circuits.map((c) => c.amps);
      if (b.form === 'tandem' || b.form === 'quad') amps = [...amps].sort((x, y) => x - y);
      const key = `${moved ? 'moved' : 'new'}|${fam.id}|${b.form}|${b.protection}|${amps.join('/')}`;
      const existing = groups.get(key);
      if (existing) {
        existing.qty++;
        continue;
      }
      const pn = fam.partNumber({ form: b.form, protection: b.protection, amps });
      groups.set(key, {
        key,
        qty: 1,
        partNumber: pn.partNumber,
        description:
          breakerDescription(fam, b.form, b.protection, amps) +
          (moved ? ', for circuits moving from another panel (reuse the old breakers if they are listed for this panel)' : ''),
        verify: pn.verify,
        form: b.form,
        sortAmps: amps[0] ?? 0,
        family: fam.id,
        moved,
      });
    }

    if (panel.interlock) {
      const il = panel.interlock;
      const famText = fam.id === 'generic' ? '' : `${fam.label} `;
      const src = sourceName(il);
      extras.push({
        key: `interlock-${panel.id}`,
        qty: 1,
        partNumber: null,
        description: `Interlock kit listed for the ${famText}${panel.busAmps} A panel "${panel.name}" (${src} breaker on the ${il.side} side, spaces ${il.side === 'left' ? '1,3' : '2,4'})`,
        verify: true,
      });
      const gens = backfedBreakers(panel).length;
      if (gens > 0) {
        extras.push({
          key: `holddown-${panel.id}`,
          qty: gens,
          partNumber: null,
          description: `Breaker hold-down (retaining) kit for the back-fed ${src} breaker${fam.id === 'generic' ? '' : `, ${fam.label}`}`,
          verify: true,
        });
      }
      if (il.kind === 'portable' && il.inletAmps) {
        extras.push({
          key: `inlet-${panel.id}`,
          qty: 1,
          partNumber: null,
          description: `Generator power inlet box, ${il.inletAmps} A 125/250 V (outdoor rated)`,
          verify: false,
        });
        extras.push({
          key: `cord-${panel.id}`,
          qty: 1,
          partNumber: null,
          description: `Generator cord set, ${il.inletAmps} A, plug to match the generator's outlet`,
          verify: false,
        });
      }
      extras.push({
        key: `sign-${panel.id}`,
        qty: 1,
        partNumber: null,
        description:
          il.kind === 'inverter'
            ? 'Warning sign: battery inverter backup and its location (at the service equipment)'
            : 'Warning sign: generator type and location (at the service equipment)',
        verify: false,
      });
    }
  }

  const breakers = [...groups.values()]
    .sort(
      (a, b) =>
        Number(a.moved) - Number(b.moved) ||
        a.family.localeCompare(b.family) ||
        FORM_ORDER[a.form] - FORM_ORDER[b.form] ||
        a.sortAmps - b.sortAmps ||
        a.key.localeCompare(b.key),
    )
    .map(({ key, qty, partNumber, description, verify }) => ({ key, qty, partNumber, description, verify }));

  return { lines: [...panelLines, ...breakers, ...gfciRcpts.values(), ...extras], existingBreakers, existingPanels };
}

export interface WireTotal {
  key: string;
  description: string;
  runs: number;
  runsWithoutLength: number;
  totalFt: number;
}

/** 240 V loads that usually need a neutral (cable "/3"). Others are assumed "/2". */
const NEUTRAL_240: readonly LoadType[] = ['range', 'cooktop-oven', 'dryer', 'subpanel', 'hot-tub', 'generator', 'inverter', 'inverter-input'];

/** Wire and cable for new circuits, grouped by size and type. Conductor counts are assumptions. */
export function wireTotals(p: Project): WireTotal[] {
  const map = new Map<string, WireTotal & { order: number }>();
  for (const panel of p.panels) {
    for (const b of panel.breakers) {
      if (b.status === 'existing') continue;
      const volts = formVolts(b.form);
      for (const c of b.circuits) {
        if (!c.wire) continue;
        const neutral = volts === 120 || NEUTRAL_240.includes(c.loadType);
        const cable = c.wire.type === 'NM-B' || c.wire.type === 'UF-B';
        const insulated = volts === 120 ? 2 : neutral ? 3 : 2;
        const desc = cable
          ? `${c.wire.size}/${insulated} ${c.wire.material} ${c.wire.type} with ground`
          : `${wireLabel(c.wire)}: ${insulated} conductors + ground`;
        const t = map.get(desc) ?? {
          key: desc,
          description: desc,
          runs: 0,
          runsWithoutLength: 0,
          totalFt: 0,
          order: WIRE_SIZES.indexOf(c.wire.size),
        };
        t.runs++;
        if (c.lengthFt && c.lengthFt > 0) t.totalFt += c.lengthFt;
        else t.runsWithoutLength++;
        map.set(desc, t);
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map(({ key, description, runs, runsWithoutLength, totalFt }) => ({ key, description, runs, runsWithoutLength, totalFt }));
}
