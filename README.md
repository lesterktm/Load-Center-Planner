# Load Center Planner

Plan US residential electrical panels (load centers) in the browser: lay out breakers and subpanels, plan a generator interlock, run the NEC Article 220 service load calculation, catch common NEC problems, and print a panel directory, schedule and materials list.

> **Planning aid only.** This tool does not certify code compliance. Local amendments and the authority having jurisdiction (AHJ) always have the final say.

## What it does

- **Visual panel**: odd spaces on the left, even on the right, with the bus legs (L1/L2) alternating every row the way a real 120/240 V load center is built. 2-pole breakers span two rows and land on both legs.
- **Breakers**: 1-pole, 2-pole, tandem and quad, with standard, AFCI, GFCI, dual-function or GFEP protection. Drag to move, or use the space picker and arrow buttons (works on tablets).
- **Moving circuits between panels**: drag a breaker onto another panel, or pick the panel in the breaker editor. Useful for moving existing circuits to a new critical-loads, garage or shop subpanel.
  - Existing circuits keep counting as existing load, and remember where they came from.
  - The schedule lists each circuit moving in ("moved from Main panel, circuit 17") and each moving out.
  - The materials list includes breakers for them, with a note to reuse the old ones if they're listed for the new panel.
  - A check covers extending conductors that don't reach (312.8) and the AFCI rule for extended circuits.
  - "Move it back" returns a circuit to its old spot.
- **kW or VA**: any load box accepts kilowatts. Type "4.5 kW" and it's stored as 4,500 VA. The Load calc tab also has quick kW → VA and volts × amps converters.
- **Circuit templates** for about 35 common residential circuits, from kitchen countertops, ranges and dryers to EV chargers, hot tubs, landscape lighting, generator inlets and subpanels.
- **Subpanels**: each is fed from a 2-pole breaker in another panel and drawn below it. Subpanel load rolls up into the parent panel's legs. Checks cover the feeder size against the subpanel bus (408.36), 4-wire feeders with separated neutral and ground (250.24(A)(5)), and separate-building electrode and disconnect rules (250.32, 225.31).
- **Generator interlocks**: shown as an interlock plate beside the main, with the back-fed generator breaker at spaces 1,3 or 2,4. Mark the circuits you'll run on generator to check them against its running watts, overall and per leg. Checks cover breaker position, main-breaker requirement, inlet rating, hold-down kit and signage (702.5, 408.36(D), 702.7), and the outdoor emergency shutdown for standby units (445.18(D), 2020+).
- **Battery inverter backup**: pick "Battery inverter" as the interlock source, typically on a critical-loads subpanel. The inverter back-feeds the panel through its breaker at 1,3 or 2,4. The interlock keeps the main off, and the main (fed from a breaker upstream) becomes the inverter bypass. An inverter card shows everything on the panel against the inverter's:
  - continuous output: the Article 220 calculated load and the connected load (702.4(B)(1))
  - per-leg limit
  - surge rating, compared with starting the largest motor
  - The card also checks the inverter breaker against 125% of the output current
  - The directory prints the normal and bypass switching steps
- **Inverter grid input**: link the breaker that feeds the inverter's AC input (or add one in the panel upstream with one click).
  - Its breaker and wire are checked against the panel load passed through plus battery charging, with charging at 125% (210.20(A)), and against the inverter's AC input limit and the largest breaker its manual allows
  - It shows how much charging power fits beside the panel's load
  - Charging power counts in the service calculation. The panel's own loads are already there, so they aren't added twice
  - Checks for an inverter that would feed its own input, and for the neutral shared by the bypass and the inverter
- **Inverter and battery models**: pick a model to fill in its figures from the manual, and see the manual's points that affect the design, with page numbers (including what the manual leaves out). So far: ECO-WORTHY 10 kW AIO (ECO10000W(SR)) and PowerMega 314 V2.
- **Battery run time**: a Battery tab (when a panel has an inverter) estimates how long the battery lasts and how long it takes to recharge from the grid.
  - Enter the capacity, usable percentage, efficiency, the inverter's own draw, and the battery output limit
  - Each circuit's energy is its load times the hours a day it runs. Typical hours are filled in, so replace them with yours or put 0 for what you'd leave off
  - Or enter a measured average load from an energy monitor
  - Checks for batteries that can't deliver the inverter's rated output or start the largest motor, a battery with no stated listing, and for the battery installation (Article 706 or 480, UL 9540, IRC R328)
- **Existing vs. new**: mark panels and breakers already installed as *Existing*. The materials list then shows only new work, and the load calculation can use the existing-dwelling method.
- **Load calculation (NEC Article 220)** for a one-family dwelling, with each step shown:
  - Standard method (Part III): Table 220.42 demand factors, 220.53 fixed appliances (75% for 4+), 220.54 dryers, Table 220.55 cooking, 220.60 noncoincident heating/cooling, 25% of the largest motor, 220.57 EV minimum (2023)
  - Optional method (220.82): 10 kVA at 100% / remainder at 40%, plus the largest 220.82(C) heating/AC selection
  - Existing dwelling (220.83(A)/(B)): before and after the new work
  - Measured demand (220.87): 125% of a year's peak plus new loads
  - What-if loads for questions like "can I add a hot tub?"
  - Verified against NEC Annex D Examples D1(a) and D2(a)
- **Feeder calculations** for every subpanel (220.40, 215.2): the standard method over the loads that subpanel serves, including any subpanels below it, with EV chargers at 125% (625.41). Enter the living area a subpanel serves, or leave it blank and its lighting and receptacle circuits count at their entered loads (useful for garages and shops). Each feeder shows:
  - the calculated load against the feeder breaker
  - a check of the feeder conductors, including the next-size-up rule (240.4(B))
  - the smallest copper and aluminum conductors for the breaker
  - the equipment ground (Table 250.122)
  - voltage drop at the calculated load
  - A feeder that carries the whole house (for example from an outdoor meter-main) uses the service calculation and the 83% conductor rule
- **Service conductors**: minimum copper and aluminum sizes for the service rating, using the 83% dwelling rule (310.12; the 310.15(B)(6)/(B)(7) tables in older editions).
- **GFCI receptacles**: tick "GFCI receptacle" on a 120 V circuit when a GFCI receptacle protects it. It satisfies the GFCI checks, shows on the panel, schedule and directory ("reset at the GFCI receptacle"), and adds the receptacles to the materials list for new work.
- **Checks** that follow the NEC edition you choose (2005, 2008, 2011, 2014, 2017, 2020 or 2023). Pick the edition in force when a house was built to survey it, and your area's current edition for new work. What changes by edition:
  - AFCI: bedrooms only (2005); most living areas (2008); adds kitchens and laundry areas (2014)
  - GFCI: laundry areas and dishwashers from 2014 (earlier, receptacles within 6 ft of a sink); EV receptacles from 2017; crawl space lighting from 2017; finished basements, 240 V receptacles and outdoor equipment from 2020; all kitchen receptacles from 2023
  - The 42-circuit panelboard limit (2005), 3-wire feeders to separate buildings (2005), the generator emergency shutdown (2020+), and section numbers that moved between editions (ampacity table, 210.12, 408.4, 408.36, 702, 625)
  - Panel fit: overlaps, spaces past the end, tandem-rated spaces, listed circuit limit (408.54)
  - Breaker vs wire: 310.16 ampacity (60 °C for NM-B/UF-B), 240.4(D) small-conductor limits, the 240.4(B) next-size-up rule, and the 240.4(G) equipment exception for AC and motors
  - Load vs breaker, plus continuous loads at 125% (210.20(A)); hints for EV, water heaters and electric heat
  - AFCI locations (210.12(A))
  - GFCI by location and edition (210.8(A)), dishwashers (210.8(D)), outdoor outlets (210.8(F), 2020+), pools and spas (Art. 680), EV receptacles (625.54)
  - Voltage drop over 3% on long runs, with a suggested wire size
  - Leg imbalance, and a calculated service load above the service rating
- **Printable outputs**: panel layouts, panel schedules (per-leg VA), door directory cards (408.4(A)), the load calculation, and a materials list (new work only) with suggested part numbers, interlock hardware and wire totals. Each panel prints on its own page.
- **Saving**: autosaves in the browser; **Save** and **Open** use a `.lcp.json` project file. Files from version 1 (single panel) open and upgrade automatically. Undo/redo with Ctrl+Z and Ctrl+Y.

## Getting started

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
```

To use it on a tablet on the same Wi-Fi network, run `npm run dev:lan` and open the "Network" address it prints.

```bash
npm test             # engine unit tests
npm run build        # production build in dist/ (static files, host anywhere)
```

## Project layout

```
src/
  core/          Electrical engine: plain TypeScript, no UI, unit-tested
    types.ts       Data model (Project → Panels → Breakers → Circuits; subpanels reference a feeder breaker)
    panel.ts       Space/row/phase geometry, placement rules
    tree.ts        Panel tree: service panel, subpanels, feeders
    circuits.ts    Circuit rows with phase loading, rolled up through feeders
    wire.ts        Ampacity tables, 240.4 rules, feeder and grounding conductor sizes, voltage drop
    editions.ts    What differs between NEC editions (scopes and section numbers)
    rules.ts       All checks, producing Findings with NEC references
    loadcalc.ts    NEC Article 220 service load calculations
    feeder.ts      Subpanel feeder calculations and service conductor sizing
    move.ts        Moving breakers between panels
    units.ts       Reading loads typed in VA, W or kW
    generator.ts   Interlock helpers (generator or inverter) and planned generator load
    inverter.ts    Battery inverter and grid-input checks for an inverter-backed panel
    battery.ts     Battery run time and recharging
    equipment.ts   Filling in settings from an inverter or battery model
    balance.ts     Per-leg connected load
    bom.ts         Materials list and wire totals
    project.ts     New/save/load, file validation and upgrade
  data/          Data you can extend without touching logic
    panel-presets.json   Generic panel templates
    families.ts          Breaker lines and catalog-number patterns
    templates.ts         Common circuit templates
    equipment.ts         Inverters and batteries, from their manuals
    usage.ts             Typical hours a day by kind of load, for battery run time
  state/         Edit actions and undo/redo
  ui/            React components
```

## Contributing data

- **Panel presets**: add an entry to `src/data/panel-presets.json`. `tandemSpaces` is `"none"`, `"all"` or a list of space numbers.
- **Breaker lines**: add a family in `src/data/families.ts`. Standard 1- and 2-pole patterns are reliable. Specialty breakers (AFCI, GFCI, dual-function) vary by generation and plug-on-neutral vs pigtail, so they are flagged *verify* in the materials list. Verified catalog data is very welcome.
- **Inverters and batteries**: add an entry in `src/data/equipment.ts`. Use only figures the manual states, write notes in your own words with page numbers, and list what the manual leaves out. Don't commit the manuals themselves; they're copyrighted.
- **Typical hours**: `src/data/usage.ts` holds planning estimates, not measurements. Better-sourced figures are welcome.
- **Rules**: each check lives in `src/core/rules.ts` and should include an NEC reference and a test in `rules.test.ts`. Anything that differs between NEC editions goes in `src/core/editions.ts`.

## Roadmap

Done: panel layout and checks, subpanels, generator and battery inverter interlocks, inverter grid input and battery run time, Article 220 service and feeder calculations, conductor sizing, NEC 2005–2023.

1. **More equipment**: transfer switches, solar charging in the battery run time, solar back-feed (705.12 120% rule), energy management systems, 120/208 V three-phase for light commercial.
2. **Existing vs. new editions**: check existing work against the edition it was built under and new work against the current one, in the same project.
3. **Estimating**: pricing on the materials list, export to CSV/PDF.
4. **Field use**: offline install (PWA), photos of existing panels.
5. **Other editions**: the 2026 NEC and editions before 2005 are not yet supported; their rules and section numbers need to be mapped and checked.

## License

Not yet chosen. Pick one (MIT is common for tools like this) before publishing.
