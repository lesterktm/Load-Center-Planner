import { useState } from 'react';
import { isKiloText, parseLoad } from '../core/units';
import { fmt0 } from './format';

interface Props {
  value: number | null;
  onChange(value: number): void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Load input in VA that also takes kilowatts: "4.5 kW" (or "4.5k") is stored as
 * 4,500 VA. While typing kW it shows the VA it converts to. Empty means 0.
 */
export function VAField({ value, onChange, placeholder = 'VA or kW', className, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value ? String(value) : '');
  const preview = draft != null && isKiloText(draft) ? parseLoad(draft) : null;
  return (
    <span className={`va-field${className ? ` ${className}` : ''}`}>
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        title="Type VA (4500) or kW (4.5 kW)"
        {...rest}
        value={shown}
        onFocus={() => setDraft(value ? String(value) : '')}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          if (text.trim() === '') return onChange(0);
          const va = parseLoad(text);
          if (va != null) onChange(va);
        }}
      />
      {preview != null && <span className="va-preview">= {fmt0(preview)} VA</span>}
    </span>
  );
}
