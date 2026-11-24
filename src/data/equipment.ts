/**
 * Inverters and batteries with figures from their manuals. Only figures the manual
 * states are filled in; what it leaves out is listed in `notStated`. Notes are in
 * our own words, with the printed page number in the manual.
 */
export interface EquipmentNote {
  text: string;
  page?: string;
}

export interface InverterModel {
  id: string;
  name: string;
  source: string;
  outputW: number;
  surgeW: number;
  /** Most current the AC input and output carry, amps per leg. */
  acAmps: number;
  /** Largest AC breaker the manual calls for, amps. */
  acBreakerAmps: number;
  efficiencyPct: number;
  /** Battery used before the inverter shuts off at its default cutoff, percent. */
  usablePct: number;
  /** Whether the inverter slows charging to stay within its AC input limit. */
  throttlesInput: boolean;
  /** Whether it can send power back to the grid. */
  exports: boolean;
  /** Charging from the grid: DC amps at the battery, the highest charging voltage, and the setting that controls it. */
  gridCharge: { defaultA: number; maxA: number; volts: number; setting: string };
  /** Added to the check on the neutral shared by the bypass and the inverter. */
  neutralNote: string;
  notes: EquipmentNote[];
  notStated: string[];
}

export interface BatteryModel {
  id: string;
  name: string;
  source: string;
  kWh: number;
  volts: number;
  /** Standard (continuous) and short-time discharge current, amps per battery. */
  continuousA: number;
  surgeA: number;
  maxParallel: number;
  /** A UL 9540 or UL 1973 listing stated in the manual. */
  listing: string | null;
  notes: EquipmentNote[];
  notStated: string[];
}

export const INVERTERS: readonly InverterModel[] = [
  {
    id: 'ecoworthy-10kw-aio',
    name: 'ECO-WORTHY 10 kW AIO, ECO10000W(SR)',
    source: 'User Manual A-1-V1.02',
    outputW: 10000,
    surgeW: 20000,
    acAmps: 63,
    acBreakerAmps: 63,
    efficiencyPct: 92,
    usablePct: 95,
    throttlesInput: false,
    exports: false,
    gridCharge: { defaultA: 60, maxA: 120, volts: 56.8, setting: 'setting 28' },
    neutralNote:
      'On the ECO-WORTHY 10 kW, setting 63 (auto N-PE connection) is off by default. With this bypass the neutral stays tied to the service, so turning it on would add a second bond on battery. ' +
      "Its manual's bypass diagrams run the neutral through the transfer switch (p. 17), which an interlock doesn't do, so confirm the wiring with your installer or ECO-WORTHY.",
    notes: [
      { text: 'AC input and AC output: 63 A maximum each, 6 AWG, 63 A breakers. 63 A is not a US breaker size, so use 60 A 2-pole; 70 A would be above the manual.', page: '10' },
      {
        text: 'Battery side: 220 A maximum, 250 A breaker, 1 AWG cable. 1 AWG copper is only 130 A at 75 °C in NEC Table 310.16, so plan on larger cable (4/0 is 230 A) or parallel runs your installer sizes.',
        page: '10',
      },
      {
        text: 'Output mode, setting 01: SUB (the default) and UTI carry the loads from the grid and use the battery only in an outage. SBU runs the loads from the battery until it drops to setting 61 (10%), then goes to the grid. Without solar, SBU can leave the battery nearly empty when an outage starts; use SUB, or raise setting 61 to keep a reserve.',
        page: '37, 38, 42, 44, 45',
      },
      { text: 'Grid charging, setting 28: 0 to 120 A at the battery, 60 A by default. The inverter charges from the grid only while it passes grid power through, so the AC input carries both at once.', page: '38, 40' },
      { text: 'Overload: the output shuts off after 5 minutes at 102 to 110%, 10 seconds at 110 to 125%, and 5 seconds above 125%, so the 20 kW peak is for starting motors. Rated for motors up to 6 HP.', page: '60' },
      { text: 'Switches between grid and battery in about 10 ms. While the grid is up it can switch to the grid if it overloads (setting 27, on by default).', page: '40, 60' },
      { text: 'Battery type, setting 08: L16 for a 16-cell LFP battery (the default is gel). For battery communication, settings 32 and 33 choose RS485 or CAN and the protocol.', page: '38, 41' },
      { text: 'With battery communication working, the battery is used down to 5% (setting 59) and an alarm sounds at 15% (setting 58).', page: '42' },
      { text: 'Indoors only (IP20), 14 to 131 °F, derated above 113 °F. Leave 8 in (200 mm) at the sides and 20 in (500 mm) above and below.', page: '5, 61' },
      { text: 'Certifications stated: UL 1741, IEC 62109-1 and -2, FCC Part 15 class B.', page: '61' },
    ],
    notStated: [
      "no-load (idle) draw, so the inverter's own draw stays at the figure entered",
      'the output limit of each leg (half the rating is assumed)',
      'any automatic limit on AC input current, so charging and pass-through are added in full',
      'any way to send power back to the grid',
    ],
  },
];

export const BATTERIES: readonly BatteryModel[] = [
  {
    id: 'ecoworthy-powermega-314-v2',
    name: 'ECO-WORTHY PowerMega 314 V2, 16 kWh',
    source: 'User Manual 2.0 (ECO-LFP4831400-V2)',
    kWh: 16.076,
    volts: 51.2,
    continuousA: 150,
    surgeA: 250,
    maxParallel: 15,
    listing: null,
    notes: [
      { text: 'Discharge: 150 A standard (7,680 W), 200 A maximum if it starts at 95 °F or cooler. The battery shuts off at 210 A after 1 second and at 250 A after half a second.', page: '10' },
      { text: 'Charge: 150 A standard, 200 A maximum. Charges only between 32 and 131 °F.', page: '10, 11' },
      { text: 'The supplied cables are 2/0. The manual suggests no more than 140 A continuous on each cable pair, so run one pair from each battery to a busbar.', page: '27, 32' },
      { text: 'Built-in 250 A breaker (2 × 125 A). A separate disconnect between the batteries and the inverter is recommended.', page: '13, 31' },
      { text: 'Floor-standing on wheels, 280 lb, 33.1 × 19.7 × 10.2 in. Up to 15 in parallel.', page: '9, 10' },
      { text: 'Communication: CAN (Pylon by default) or RS485 (Pylon by default). Match it in the inverter settings. Set a different DIP address on each battery.', page: '14, 20' },
      { text: 'Turn on the breaker first and then the power switch; turn off in the reverse order.', page: '33, 34' },
    ],
    notStated: ['a UL 9540 or UL 1973 listing (it says only that it was tested to "UL, IEC, UN38.3 etc." requirements)'],
  },
];

export const inverterModel = (id: string | null | undefined): InverterModel | undefined => INVERTERS.find((x) => x.id === id);
export const batteryModel = (id: string | null | undefined): BatteryModel | undefined => BATTERIES.find((x) => x.id === id);
