import type { Breaker, Circuit, InstallStatus, Panel, Project } from './types';
import { breakerFromTemplate, defaultInterlock, newPanel, newProject } from './project';
import { TEMPLATES } from '../data/templates';

type Placement = [templateId: string, space: number, status: InstallStatus, extra?: Partial<Omit<Circuit, 'id'>>];

function place(layout: Placement[]): Breaker[] {
  return layout.map(([id, space, status, extra]) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) throw new Error(`Unknown template ${id}`);
    return breakerFromTemplate(t, space, extra, status);
  });
}

/**
 * An existing 200 A house getting new work: an EV charger, a generator
 * interlock with a 30 A inlet, and a feeder to a detached workshop subpanel.
 * Used on first run and from the "Example" button.
 */
export function exampleProject(): Project {
  const p = newProject();
  p.name = 'Example house';
  p.address = '123 Example St';
  p.necEdition = '2023';
  p.loadCalc = { ...p.loadCalc, floorAreaFt2: 2000 };

  const E: InstallStatus = 'existing';
  const N: InstallStatus = 'new';
  const main: Panel = {
    ...p.panels[0],
    name: 'Main panel',
    family: 'sqd-hom',
    status: 'existing',
    interlock: { ...defaultInterlock(), side: 'right', kind: 'portable', generatorWatts: 7500, inletAmps: 30 },
  };
  main.breakers = place([
    ['range', 1, E],
    ['generator-30', 2, N, { lengthFt: 15 }],
    ['kitchen-counter', 5, E, { label: 'Kitchen countertop – left of sink', onGenerator: true }],
    ['dryer', 6, E],
    ['refrigerator', 7, E, { onGenerator: true }],
    ['microwave', 9, E],
    ['kitchen-counter', 10, E, { label: 'Kitchen countertop – island' }],
    ['water-heater', 11, E],
    ['dishwasher', 12, E],
    ['disposal', 14, E],
    ['bath-recep', 15, E, { label: 'Bathroom receptacles (both baths)' }],
    ['ac', 16, E],
    ['bedroom', 17, E, { label: 'Primary bedroom', onGenerator: true }],
    ['living', 19, E, { onGenerator: true }],
    ['laundry', 20, E],
    ['furnace', 21, E, { onGenerator: true }],
    ['bedroom', 22, E, { label: 'Bedrooms 2 & 3' }],
    ['garage', 23, E],
    ['hall-smoke', 24, E, { onGenerator: true }],
    ['ev-40', 25, N, { lengthFt: 30 }],
    ['outdoor', 26, E],
    ['subpanel-60', 29, N, { label: 'Subpanel: Workshop', lengthFt: 120 }],
    ['landscape', 28, E, { lengthFt: 200, label: 'Landscape lighting transformer (back yard)' }],
    ['spare', 30, E],
  ]);

  // Like many houses of this age, the bath, garage and outdoor circuits get GFCI protection from receptacles, not breakers.
  for (const space of [15, 23, 26]) {
    const b = main.breakers.find((x) => x.space === space)!;
    b.protection = 'standard';
    b.circuits[0].gfciReceptacle = true;
  }

  const feeder = main.breakers.find((b) => b.space === 29)!;
  const shop = newPanel({
    presetId: null,
    name: 'Workshop',
    family: 'sqd-hom',
    busAmps: 100,
    mainType: 'main-breaker',
    mainAmps: 100,
    spaces: 12,
    maxCircuits: 24,
    tandemSpaces: 'all',
    status: 'new',
    separateBuilding: true,
    feed: { panelId: main.id, breakerId: feeder.id },
  });
  shop.breakers = place([
    ['garage', 1, N, { label: 'Workshop receptacles', location: 'accessory-building' }],
    ['garage-lights', 2, N, { label: 'Workshop lights', location: 'accessory-building' }],
    ['air-compressor', 3, N, { location: 'accessory-building' }],
    ['minisplit', 4, N, { label: 'Workshop mini-split' }],
  ]);

  p.panels = [main, shop];
  return p;
}
