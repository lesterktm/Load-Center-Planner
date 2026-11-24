import type { MethodResult } from '../../core/loadcalc';
import { fmt0, fmt1 } from '../format';

/** The steps of a load calculation, with NEC references, ending in amps at 240 V. */
export function MethodTable({ method: m, caption }: { method: MethodResult; caption?: string }) {
  return (
    <table className="data calc-table">
      <caption>
        {caption ?? m.title} <span className="muted">· NEC {m.ref}</span>
      </caption>
      <tbody>
        {m.lines.map((l, i) => (
          <tr key={i} className={l.strong ? 'strong' : ''}>
            <td>
              {l.label}
              {l.ref && <span className="line-ref">{l.ref}</span>}
            </td>
            <td className="num">{fmt0(l.va)} VA</td>
          </tr>
        ))}
        <tr className="strong">
          <td>÷ 240 V</td>
          <td className="num">{fmt1(m.amps)} A</td>
        </tr>
      </tbody>
      {m.notes.length > 0 && (
        <tfoot>
          <tr>
            <td colSpan={2} className="muted">
              {m.notes.join(' ')}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
