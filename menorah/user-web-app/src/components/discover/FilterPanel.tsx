'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { CounsellorFilters } from '@/types';

interface FilterPanelProps {
  filters: CounsellorFilters;
  specializations: string[];
  languages: string[];
  specializationsLoading?: boolean;
  languagesLoading?: boolean;
  onChange: (filters: CounsellorFilters) => void;
}

interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}

const DEFAULT_SORT_VALUE = 'rating_desc';

const SORT_OPTIONS: DropdownOption[] = [
  { value: 'rating_desc', label: 'Highest rated' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'experience_desc', label: 'Most experienced' },
  { value: 'experience_asc', label: 'Least experienced' },
];

const RATING_OPTIONS: DropdownOption[] = [
  { value: '5', label: '5 stars & above' },
  { value: '4.5', label: '4.5 stars & above' },
  { value: '4', label: '4 stars & above' },
  { value: '3', label: '3 stars & above' },
  { value: '2', label: '2 stars & above' },
  { value: '1', label: '1 star & above' },
  { value: '', label: 'Any rating' },
];

function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  useEffect(() => {
    if (!open) return;

    const nextIndex = selectedIndex >= 0 && !options[selectedIndex]?.disabled
      ? selectedIndex
      : options.findIndex((option) => !option.disabled);
    setActiveIndex(nextIndex);
  }, [open, options, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  const focusNextOption = (direction: 1 | -1) => {
    if (options.length === 0) return;

    let next = activeIndex;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]?.disabled) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const selectOption = (option: DropdownOption) => {
    if (option.disabled) return;

    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      focusNextOption(event.key === 'ArrowDown' ? 1 : -1);
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }

      const option = options[activeIndex];
      if (option) selectOption(option);
    }

    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <label id={`${id}-label`} className="text-sm font-semibold text-gray-700 dark:text-primary-100">
        {label}
      </label>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        className={cn(
          'group flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-primary-100',
          'bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,250,247,0.94))] px-3.5 py-2.5 text-left text-sm font-extrabold text-gray-950',
          'shadow-[0_14px_30px_-26px_rgba(17,24,39,0.5)] transition duration-200 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-[0_18px_38px_-28px_rgba(45,122,92,0.55)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:border-primary-800 dark:bg-[linear-gradient(180deg,rgba(22,51,40,0.96),rgba(9,25,17,0.94))] dark:text-primary-50 dark:focus-visible:ring-offset-primary-950',
          open && 'border-primary-400 shadow-[0_18px_42px_-28px_rgba(45,122,92,0.72)]'
        )}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span id={`${id}-value`} className="min-w-0 flex-1 break-words leading-5">
          {selectedOption?.label ?? 'Select'}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-primary-600 transition-transform duration-200 dark:text-primary-100/70', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-40 mt-2 origin-top overflow-hidden rounded-2xl border border-primary-100 bg-white/[0.98] shadow-[0_24px_70px_-30px_rgba(17,24,39,0.62)] backdrop-blur-xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 dark:border-primary-800 dark:bg-primary-950/[0.98]"
          role="listbox"
          aria-labelledby={`${id}-label`}
        >
          <div className="max-h-[65vh] overflow-y-auto overscroll-contain p-2 pr-1.5 touch-pan-y [scrollbar-gutter:stable] md:max-h-80">
            {options.map((option, index) => {
              const selected = option.value === value;
              const active = index === activeIndex;

              return (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  className={cn(
                    'group/option flex min-h-11 w-full items-start justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-bold transition duration-200 animate-in fade-in slide-in-from-top-1',
                    'disabled:cursor-not-allowed disabled:opacity-55',
                    'hover:-translate-y-0.5 hover:bg-primary-50 hover:shadow-[0_14px_28px_-24px_rgba(45,122,92,0.65)] focus-visible:-translate-y-0.5 focus-visible:bg-primary-50 focus-visible:outline-none',
                    'dark:hover:bg-primary-900/80 dark:focus-visible:bg-primary-900/80',
                    selected && 'bg-primary-100 text-primary-950 shadow-[inset_0_0_0_1px_rgba(45,122,92,0.18)] dark:bg-primary-800 dark:text-primary-50',
                    active && !selected && 'bg-primary-50 text-primary-950 dark:bg-primary-900/80 dark:text-primary-50'
                  )}
                  style={{ animationDelay: `${Math.min(index, 8) * 22}ms`, animationFillMode: 'both' }}
                  onClick={() => selectOption(option)}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition duration-200',
                        selected
                          ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-300 dark:bg-primary-300 dark:text-primary-950'
                          : 'border-primary-100 bg-primary-50 text-primary-700 group-hover/option:border-primary-300 dark:border-primary-800 dark:bg-primary-900 dark:text-primary-100'
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full bg-current transition-transform duration-200', selected ? 'scale-100' : 'scale-0')} />
                    </span>
                    <span className="min-w-0 break-words leading-5">{option.label}</span>
                  </span>
                  <Check
                    className={cn('h-4 w-4 shrink-0 text-primary-700 transition duration-200 dark:text-primary-100', selected ? 'scale-100 opacity-100' : 'scale-75 opacity-0')}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const parseSortValue = (combined: string): Pick<CounsellorFilters, 'sortBy' | 'sortOrder'> => {
  const [field, order] = combined.split('_') as [CounsellorFilters['sortBy'], 'asc' | 'desc'];
  return { sortBy: field, sortOrder: order };
};

export function FilterPanel({
  filters,
  specializations,
  languages,
  specializationsLoading = false,
  languagesLoading = false,
  onChange,
}: FilterPanelProps) {
  const [local, setLocal] = useState<CounsellorFilters>(filters);

  useEffect(() => {
    setLocal(filters);
  }, [filters]);

  const set = <K extends keyof CounsellorFilters>(key: K, value: CounsellorFilters[K]) =>
    setLocal((previous) => ({ ...previous, [key]: value }));

  const currentSort = local.sortBy ? `${local.sortBy}_${local.sortOrder ?? 'desc'}` : DEFAULT_SORT_VALUE;
  const minPrice = local.minPrice;
  const maxPrice = local.maxPrice;
  const hasNegativePrice = (minPrice !== undefined && minPrice < 0) || (maxPrice !== undefined && maxPrice < 0);
  const priceError = hasNegativePrice
    ? 'Price values cannot be negative'
    : minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice
      ? 'Minimum price cannot be greater than maximum price'
      : '';

  const specializationOptions: DropdownOption[] = [
    { value: '', label: 'All specializations' },
    ...(specializations.length === 0
      ? [{
        value: '__specializations_empty',
        label: specializationsLoading ? 'Loading...' : 'No specializations available',
        disabled: true,
      }]
      : specializations.map((specialization) => ({ value: specialization, label: specialization }))),
  ];

  const languageOptions: DropdownOption[] = [
    { value: '', label: 'Any language' },
    ...(languages.length === 0
      ? [{
        value: '__languages_empty',
        label: languagesLoading ? 'Loading...' : 'No languages available',
        disabled: true,
      }]
      : languages.map((language) => ({ value: language, label: language }))),
  ];

  const handleSortChange = (combined: string) => {
    setLocal((previous) => ({ ...previous, ...parseSortValue(combined) }));
  };

  const apply = () => {
    if (priceError) return;
    onChange({
      ...local,
      ...parseSortValue(currentSort),
      page: 1,
      limit: local.limit ?? filters.limit ?? 9,
    });
  };

  const reset = () => {
    const cleared: CounsellorFilters = {
      search: filters.search,
      specialization: undefined,
      language: undefined,
      minRating: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      sortBy: 'rating',
      sortOrder: 'desc',
      page: 1,
      limit: filters.limit ?? 9,
    };
    setLocal(cleared);
    onChange(cleared);
  };

  const hasFilters = !!(
    local.specialization ||
    local.language ||
    local.minRating ||
    local.minPrice !== undefined ||
    local.maxPrice !== undefined ||
    currentSort !== DEFAULT_SORT_VALUE
  );

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-black text-gray-950 dark:text-primary-50">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 text-xs text-red-500 transition-colors hover:text-red-700 dark:text-red-300"
          >
            <X className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      <FilterDropdown
        label="Specialization"
        value={local.specialization || ''}
        options={specializationOptions}
        onChange={(value) => set('specialization', value || undefined)}
      />

      <FilterDropdown
        label="Language"
        value={local.language || ''}
        options={languageOptions}
        onChange={(value) => set('language', value || undefined)}
      />

      <FilterDropdown
        label="Minimum Rating"
        value={local.minRating ? String(local.minRating) : ''}
        options={RATING_OPTIONS}
        onChange={(value) => set('minRating', value ? parseFloat(value) : undefined)}
      />

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700 dark:text-primary-100">Price Range (INR/hr)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            min={0}
            value={local.minPrice ?? ''}
            onChange={(event) => set('minPrice', event.target.value === '' ? undefined : Number(event.target.value))}
            className={cn('input-field text-sm', priceError && 'border-red-400 focus:ring-red-300')}
          />
          <span className="shrink-0 text-sm text-gray-400 dark:text-primary-100/50">to</span>
          <input
            type="number"
            placeholder="Max"
            min={0}
            value={local.maxPrice ?? ''}
            onChange={(event) => set('maxPrice', event.target.value === '' ? undefined : Number(event.target.value))}
            className={cn('input-field text-sm', priceError && 'border-red-400 focus:ring-red-300')}
          />
        </div>
        {priceError && <p className="text-sm text-red-500 dark:text-red-300">{priceError}</p>}
      </div>

      <FilterDropdown
        label="Sort by"
        value={currentSort}
        options={SORT_OPTIONS}
        onChange={handleSortChange}
      />

      <Button fullWidth onClick={apply} disabled={!!priceError}>Apply Filters</Button>
    </div>
  );
}
