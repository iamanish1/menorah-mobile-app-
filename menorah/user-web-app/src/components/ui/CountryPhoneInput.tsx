'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildPhoneNumber,
  parsePhoneNumberParts,
  PHONE_COUNTRIES,
  type PhoneCountry,
} from '@/lib/phoneCountries';

interface CountryPhoneInputProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
}

export function CountryPhoneInput({
  label,
  value = '',
  onChange,
  error,
  hint,
  required = false,
}: CountryPhoneInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const parsedPhone = useMemo(() => parsePhoneNumberParts(value), [value]);
  const [selectedCountry, setSelectedCountry] = useState(parsedPhone.country);
  const country = value
    ? selectedCountry.dialCode === parsedPhone.country.dialCode
      ? selectedCountry
      : parsedPhone.country
    : selectedCountry;
  const nationalNumber = parsedPhone.nationalNumber;
  const filteredCountries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const numericNeedle = needle.replace(/\D/g, '');
    if (!needle) return PHONE_COUNTRIES;
    return PHONE_COUNTRIES.filter((item) =>
      item.name.toLowerCase().includes(needle) ||
      item.iso2.toLowerCase().includes(needle) ||
      item.dialCode.includes(numericNeedle)
    );
  }, [query]);

  useEffect(() => {
    if (value && selectedCountry.dialCode !== parsedPhone.country.dialCode) {
      setSelectedCountry(parsedPhone.country);
    }
  }, [parsedPhone.country, parsedPhone.country.dialCode, selectedCountry.dialCode, value]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.setTimeout(() => searchRef.current?.focus(), 0);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  const selectCountry = (nextCountry: PhoneCountry) => {
    setSelectedCountry(nextCountry);
    onChange(buildPhoneNumber(nextCountry, nationalNumber));
    setQuery('');
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div ref={rootRef} className="relative w-full space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-semibold text-gray-700 dark:text-primary-100">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      <div
        className={cn(
          'flex min-h-[52px] overflow-visible rounded-2xl border bg-white transition-all duration-150',
          'focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary-500',
          'dark:bg-primary-900',
          error ? 'border-red-400 focus-within:ring-red-400' : 'border-gray-200 dark:border-primary-800'
        )}
      >
        <button
          ref={buttonRef}
          type="button"
          className={cn(
            'flex min-h-[50px] min-w-[8.25rem] items-center justify-center gap-2 rounded-l-2xl border-r px-3',
            'bg-primary-50 text-gray-900 transition-colors duration-150 hover:bg-primary-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-0',
            'dark:border-primary-800 dark:bg-primary-800/70 dark:text-primary-50 dark:hover:bg-primary-800'
          )}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="flex h-7 min-w-8 items-center justify-center rounded-full bg-primary-200/70 text-[0.72rem] font-black text-primary-900 dark:bg-primary-400/20 dark:text-primary-100">
            {country.iso2}
          </span>
          <span className="text-sm font-semibold">+{country.dialCode}</span>
          <ChevronDown className={cn('h-4 w-4 transition-transform duration-150', open && 'rotate-180')} />
        </button>

        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalNumber}
          placeholder="50 360 4235"
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(buildPhoneNumber(country, event.target.value))}
          className="min-w-0 flex-1 rounded-r-2xl bg-transparent px-4 py-3 text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-primary-50 dark:placeholder:text-primary-100/45"
        />
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          onKeyDown={handleMenuKeyDown}
          className={cn(
            'absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl',
            'origin-top animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-200',
            'dark:border-primary-800 dark:bg-primary-950'
          )}
        >
          <div className="relative border-b border-gray-100 p-2.5 dark:border-primary-800">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-primary-100/55" />
            <input
              ref={searchRef}
              value={query}
              placeholder="Search country or code"
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-primary-800 dark:bg-primary-900 dark:text-primary-50"
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5">
            {filteredCountries.map((item) => {
              const selected = item.iso2 === country.iso2 && item.dialCode === country.dialCode;
              return (
                <button
                  key={`${item.iso2}-${item.dialCode}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => selectCountry(item)}
                  className={cn(
                    'grid min-h-11 w-full grid-cols-[2.5rem_1fr_auto_1.25rem] items-center gap-2 rounded-xl px-3 py-2 text-left transition duration-150',
                    'hover:-translate-y-px hover:bg-primary-50 focus-visible:-translate-y-px focus-visible:bg-primary-50 focus-visible:outline-none',
                    'dark:hover:bg-primary-800/70 dark:focus-visible:bg-primary-800/70',
                    selected && 'bg-primary-100 text-primary-950 dark:bg-primary-800 dark:text-primary-50'
                  )}
                >
                  <span className="text-xs font-black text-primary-700 dark:text-primary-200">{item.iso2}</span>
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="text-sm text-gray-500 dark:text-primary-100/65">+{item.dialCode}</span>
                  {selected && <Check className="h-4 w-4 text-primary-700 dark:text-primary-200" />}
                </button>
              );
            })}
            {filteredCountries.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500 dark:text-primary-100/65">
                No country codes found.
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {hint && !error && <p className="text-sm text-gray-500 dark:text-primary-100/65">{hint}</p>}
    </div>
  );
}
