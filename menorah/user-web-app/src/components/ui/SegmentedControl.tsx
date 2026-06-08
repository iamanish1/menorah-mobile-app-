import type { ElementType } from 'react';
import { cn } from '@/lib/utils';

interface SegmentedOption {
  value: string;
  label: string;
  icon?: ElementType;
  disabled?: boolean;
}

interface SegmentedControlProps {
  value: string;
  options: SegmentedOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

export function SegmentedControl({ value, options, onChange, ariaLabel, className }: SegmentedControlProps) {
  return (
    <div className={cn('app-segmented-control', className)} role="radiogroup" aria-label={ariaLabel}>
      {options.map(({ value: optionValue, label, icon: Icon, disabled }) => {
        const active = value === optionValue;

        return (
          <button
            key={optionValue || label}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            data-active={active ? 'true' : 'false'}
            className="app-segmented-option"
            onClick={() => onChange(optionValue)}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
