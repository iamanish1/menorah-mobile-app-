import { cn } from '@/lib/utils';

interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function ToggleSwitch({ checked, onCheckedChange, label, disabled, className }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn('app-toggle-switch', className)}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="app-toggle-switch-thumb" aria-hidden="true" />
    </button>
  );
}
