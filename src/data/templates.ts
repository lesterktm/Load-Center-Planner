import type { Circuit, Protection, Wire, WireSize, WireType } from '../core/types';

/**
 * Starting points for common residential circuits. Loads are typical estimates
 * and should be replaced with nameplate values when known.
 */
export interface CircuitTemplate {
  id: string;
  group: string;
  name: string;
  form: 'single' | 'double';
  protection: Protection;
  circuit: Partial<Omit<Circuit, 'id'>>;
}

const cu = (size: WireSize, type: WireType = 'NM-B'): Wire => ({ size, material: 'Cu', type });

export const TEMPLATES: readonly CircuitTemplate[] = [
  // Kitchen
  { id: 'kitchen-counter', group: 'Kitchen', name: 'Countertop receptacles', form: 'single', protection: 'df',
    circuit: { label: 'Kitchen countertop receptacles', location: 'kitchen', loadType: 'small-appliance', amps: 20, loadVA: 1500, servesReceptacles: true, wire: cu('12') } },
  { id: 'refrigerator', group: 'Kitchen', name: 'Refrigerator', form: 'single', protection: 'df',
    circuit: { label: 'Refrigerator', location: 'kitchen', loadType: 'refrigerator', amps: 20, loadVA: 800, servesReceptacles: true, wire: cu('12') } },
  { id: 'dishwasher', group: 'Kitchen', name: 'Dishwasher', form: 'single', protection: 'df',
    circuit: { label: 'Dishwasher', location: 'kitchen', loadType: 'dishwasher', amps: 20, loadVA: 1200, servesReceptacles: false, wire: cu('12') } },
  { id: 'disposal', group: 'Kitchen', name: 'Disposal', form: 'single', protection: 'df',
    circuit: { label: 'Disposal', location: 'kitchen', loadType: 'disposal', amps: 20, loadVA: 900, servesReceptacles: true, wire: cu('12') } },
  { id: 'microwave', group: 'Kitchen', name: 'Microwave', form: 'single', protection: 'df',
    circuit: { label: 'Microwave', location: 'kitchen', loadType: 'microwave', amps: 20, loadVA: 1500, servesReceptacles: true, wire: cu('12') } },
  { id: 'range', group: 'Kitchen', name: 'Range', form: 'double', protection: 'standard',
    circuit: { label: 'Range', location: 'kitchen', loadType: 'range', amps: 50, loadVA: 12000, servesReceptacles: true, wire: cu('6'),
      notes: '12 kW nameplate. Branch circuit and load calc use the Table 220.55 demand (8 kW).' } },
  { id: 'cooktop', group: 'Kitchen', name: 'Cooktop / wall oven', form: 'double', protection: 'standard',
    circuit: { label: 'Cooktop', location: 'kitchen', loadType: 'cooktop-oven', amps: 40, loadVA: 7000, servesReceptacles: false, wire: cu('8') } },

  // Laundry & bath
  { id: 'laundry', group: 'Laundry & bath', name: 'Laundry receptacles', form: 'single', protection: 'df',
    circuit: { label: 'Laundry receptacles', location: 'laundry', loadType: 'laundry', amps: 20, loadVA: 1500, servesReceptacles: true, wire: cu('12') } },
  { id: 'dryer', group: 'Laundry & bath', name: 'Clothes dryer', form: 'double', protection: 'standard',
    circuit: { label: 'Clothes dryer', location: 'laundry', loadType: 'dryer', amps: 30, loadVA: 5000, servesReceptacles: true, wire: cu('10') } },
  { id: 'bath-recep', group: 'Laundry & bath', name: 'Bathroom receptacles', form: 'single', protection: 'gfci',
    circuit: { label: 'Bathroom receptacles', location: 'bathroom', loadType: 'bathroom', amps: 20, loadVA: 1500, servesReceptacles: true, wire: cu('12') } },
  { id: 'bath-lights', group: 'Laundry & bath', name: 'Bath lights & fan', form: 'single', protection: 'standard',
    circuit: { label: 'Bathroom lights & exhaust fan', location: 'bathroom', loadType: 'lighting', amps: 15, loadVA: 400, servesReceptacles: false, wire: cu('14') } },

  // Living areas
  { id: 'bedroom', group: 'Living areas', name: 'Bedroom', form: 'single', protection: 'afci',
    circuit: { label: 'Bedroom', location: 'bedroom', loadType: 'general', amps: 15, loadVA: 1000, servesReceptacles: true, wire: cu('14') } },
  { id: 'living', group: 'Living areas', name: 'Living room', form: 'single', protection: 'afci',
    circuit: { label: 'Living room', location: 'living', loadType: 'general', amps: 15, loadVA: 1000, servesReceptacles: true, wire: cu('14') } },
  { id: 'dining', group: 'Living areas', name: 'Dining room', form: 'single', protection: 'afci',
    circuit: { label: 'Dining room', location: 'dining', loadType: 'general', amps: 20, loadVA: 1000, servesReceptacles: true, wire: cu('12') } },
  { id: 'office', group: 'Living areas', name: 'Office / den', form: 'single', protection: 'afci',
    circuit: { label: 'Office', location: 'office-den', loadType: 'general', amps: 20, loadVA: 1200, servesReceptacles: true, wire: cu('12') } },
  { id: 'hall-smoke', group: 'Living areas', name: 'Hall lights & smoke alarms', form: 'single', protection: 'afci',
    circuit: { label: 'Hallway lights & smoke alarms', location: 'hallway', loadType: 'lighting', amps: 15, loadVA: 400, servesReceptacles: false, wire: cu('14') } },

  // HVAC & water
  { id: 'water-heater', group: 'HVAC & water', name: 'Water heater (4500 W)', form: 'double', protection: 'standard',
    circuit: { label: 'Water heater', location: 'utility', loadType: 'water-heater', amps: 30, loadVA: 4500, continuous: true, servesReceptacles: false, wire: cu('10') } },
  { id: 'ac', group: 'HVAC & water', name: 'AC condenser / heat pump', form: 'double', protection: 'standard',
    circuit: { label: 'AC condenser', location: 'outdoor', loadType: 'hvac', amps: 30, loadVA: 5000, servesReceptacles: false, wire: cu('10', 'THHN/THWN-2'),
      notes: 'Set the breaker to the nameplate MOCP and the wire to at least the nameplate MCA.' } },
  { id: 'furnace', group: 'HVAC & water', name: 'Furnace / air handler', form: 'single', protection: 'standard',
    circuit: { label: 'Furnace blower', location: 'utility', loadType: 'furnace', amps: 15, loadVA: 800, servesReceptacles: false, wire: cu('14') } },
  { id: 'minisplit', group: 'HVAC & water', name: 'Mini-split heat pump', form: 'double', protection: 'standard',
    circuit: { label: 'Mini-split heat pump', location: 'outdoor', loadType: 'hvac', amps: 20, loadVA: 2400, servesReceptacles: false, wire: cu('12', 'THHN/THWN-2'),
      notes: 'Set the breaker to the nameplate MOCP and the wire to at least the nameplate MCA.' } },
  { id: 'baseboard', group: 'HVAC & water', name: 'Electric baseboard heat', form: 'double', protection: 'standard',
    circuit: { label: 'Baseboard heat', location: 'multiple', loadType: 'heat', amps: 20, loadVA: 3000, continuous: true, servesReceptacles: false, wire: cu('12') } },
  { id: 'well-pump', group: 'HVAC & water', name: 'Well pump (240 V)', form: 'double', protection: 'standard',
    circuit: { label: 'Well pump', location: 'utility', loadType: 'motor', amps: 20, loadVA: 1800, servesReceptacles: false, wire: cu('12') } },
  { id: 'sump', group: 'HVAC & water', name: 'Sump pump', form: 'single', protection: 'gfci',
    circuit: { label: 'Sump pump', location: 'unfinished-basement', loadType: 'motor', amps: 20, loadVA: 1000, servesReceptacles: true, wire: cu('12') } },

  // Garage & outdoor
  { id: 'garage', group: 'Garage & outdoor', name: 'Garage receptacles', form: 'single', protection: 'gfci',
    circuit: { label: 'Garage receptacles', location: 'garage', loadType: 'receptacles', amps: 20, loadVA: 1500, servesReceptacles: true, wire: cu('12') } },
  { id: 'garage-lights', group: 'Garage & outdoor', name: 'Garage lights', form: 'single', protection: 'standard',
    circuit: { label: 'Garage lights', location: 'garage', loadType: 'lighting', amps: 15, loadVA: 500, servesReceptacles: false, wire: cu('14') } },
  { id: 'outdoor', group: 'Garage & outdoor', name: 'Outdoor receptacles', form: 'single', protection: 'gfci',
    circuit: { label: 'Outdoor receptacles', location: 'outdoor', loadType: 'receptacles', amps: 20, loadVA: 1000, servesReceptacles: true, wire: cu('12') } },
  { id: 'landscape', group: 'Garage & outdoor', name: 'Landscape lighting transformer', form: 'single', protection: 'gfci',
    circuit: { label: 'Landscape lighting transformer', location: 'outdoor', loadType: 'landscape-lighting', amps: 20, loadVA: 600, servesReceptacles: true, wire: cu('12', 'UF-B') } },
  { id: 'fountain', group: 'Garage & outdoor', name: 'Pond / fountain pump', form: 'single', protection: 'gfci',
    circuit: { label: 'Fountain pump', location: 'pool-spa', loadType: 'motor', amps: 20, loadVA: 800, servesReceptacles: true, wire: cu('12', 'UF-B') } },
  { id: 'ev-40', group: 'Garage & outdoor', name: 'EV charger (40 A, hard-wired)', form: 'double', protection: 'standard',
    circuit: { label: 'EV charger', location: 'garage', loadType: 'ev', amps: 50, loadVA: 9600, continuous: true, servesReceptacles: false, wire: cu('6') } },
  { id: 'hot-tub', group: 'Garage & outdoor', name: 'Hot tub / spa', form: 'double', protection: 'gfci',
    circuit: { label: 'Hot tub', location: 'pool-spa', loadType: 'hot-tub', amps: 50, loadVA: 7200, servesReceptacles: false, wire: cu('6', 'THHN/THWN-2') } },
  { id: 'air-compressor', group: 'Garage & outdoor', name: 'Air compressor (240 V)', form: 'double', protection: 'standard',
    circuit: { label: 'Air compressor', location: 'garage', loadType: 'motor', amps: 30, loadVA: 3600, servesReceptacles: false, wire: cu('10') } },

  // Backup power
  { id: 'generator-30', group: 'Backup power', name: 'Generator inlet, 30 A (back-fed)', form: 'double', protection: 'standard',
    circuit: { label: 'Generator inlet (back-fed)', location: 'outdoor', loadType: 'generator', amps: 30, loadVA: 0, servesReceptacles: false, wire: cu('10', 'THHN/THWN-2') } },
  { id: 'generator-50', group: 'Backup power', name: 'Generator inlet, 50 A (back-fed)', form: 'double', protection: 'standard',
    circuit: { label: 'Generator inlet (back-fed)', location: 'outdoor', loadType: 'generator', amps: 50, loadVA: 0, servesReceptacles: false, wire: cu('6', 'THHN/THWN-2') } },
  { id: 'inverter-out', group: 'Backup power', name: 'Battery inverter output (back-fed)', form: 'double', protection: 'standard',
    circuit: { label: 'Inverter output (back-fed)', location: 'utility', loadType: 'inverter', amps: 70, loadVA: 0, servesReceptacles: false, wire: cu('4', 'THHN/THWN-2'),
      notes: 'Size the breaker and wire per the inverter manual (usually at least 125% of the continuous output current).' } },
  { id: 'inverter-grid', group: 'Backup power', name: 'Battery inverter grid input', form: 'double', protection: 'standard',
    circuit: { label: 'Inverter grid input', location: 'utility', loadType: 'inverter-input', amps: 60, loadVA: 0, continuous: true, servesReceptacles: false, wire: cu('6', 'THHN/THWN-2'),
      notes: 'Load = the most the inverter draws from the grid to charge its batteries. Size the breaker and wire per the inverter manual.' } },

  // Other
  { id: 'subpanel-60', group: 'Other', name: 'Subpanel feeder (60 A)', form: 'double', protection: 'standard',
    circuit: { label: 'Subpanel', location: 'multiple', loadType: 'subpanel', amps: 60, loadVA: 0, servesReceptacles: false, wire: cu('6', 'THHN/THWN-2') } },
  { id: 'spare', group: 'Other', name: 'Spare breaker', form: 'single', protection: 'standard',
    circuit: { label: 'Spare', location: 'other', loadType: 'other', amps: 20, loadVA: 0, servesReceptacles: false, wire: null } },
];
