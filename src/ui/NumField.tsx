import { useState } from 'react';

interface Props {
  value: number | null;
  onChange(value: number | null): void;
  allowEmpty?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Number input that lets the user clear and retype freely. It reports a value
 * only when the text parses, and shows the committed value when not focused.
 */
export function NumField({ value, onChange, allowEmpty = false, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? '' : String(value));
  return (
    <input
      type="number"
      inputMode="decimal"
      {...rest}
      value={shown}
      onFocus={() => setDraft(value == null ? '' : String(value))}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        if (text.trim() === '') {
          if (allowEmpty) onChange(null);
          return;
        }
        const n = Number(text);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
