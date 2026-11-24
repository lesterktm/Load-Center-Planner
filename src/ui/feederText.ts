import type { Wire } from '../core/types';
import type { FeederWireVerdict } from '../core/wire';
import { wireLabel } from '../core/wire';

/** One-line status of a feeder's conductors, with a CSS class (ok / warn / bad). */
export function feederWireStatus(wire: Wire | null, v: FeederWireVerdict | null, breakerAmps: number): { cls: string; text: string } {
  if (!wire) return { cls: 'muted', text: 'No conductors entered on the feeder breaker.' };
  const w = wireLabel(wire);
  if (!v || v.status === 'unknown') return { cls: 'bad', text: `${w} is not in the ampacity table.` };
  switch (v.status) {
    case 'ok':
      return { cls: 'ok', text: `${w}: ${v.ampacity} A. OK for the ${breakerAmps} A breaker.` };
    case 'dwelling':
      return { cls: 'ok', text: `${w}: ${v.ampacity} A. OK at 83% of ${breakerAmps} A (whole-house feeder).` };
    case 'next-size-up':
      return { cls: 'ok', text: `${w}: ${v.ampacity} A. OK by the next-size-up rule, since the calculated load fits (240.4(B)).` };
    case 'below-load':
      return { cls: 'bad', text: `${w}: ${v.ampacity} A. Smaller than the calculated load.` };
    case 'undersized':
      return { cls: 'bad', text: `${w}: ${v.ampacity} A. Too small for the ${breakerAmps} A breaker.` };
  }
}
