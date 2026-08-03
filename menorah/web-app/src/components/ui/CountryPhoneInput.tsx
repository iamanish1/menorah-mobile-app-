'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  buildPhoneNumber,
  parsePhoneNumberParts,
  PHONE_COUNTRIES,
  type PhoneCountry,
} from '@/lib/phoneCountries';
import styles from './CountryPhoneInput.module.css';

type CountryPhoneInputProps = {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
};

export default function CountryPhoneInput({
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
    if (!needle) return PHONE_COUNTRIES;
    return PHONE_COUNTRIES.filter((item) =>
      item.name.toLowerCase().includes(needle) ||
      item.iso2.toLowerCase().includes(needle) ||
      item.dialCode.includes(needle.replace(/\D/g, ''))
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
    setOpen(false);
    setQuery('');
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
    <div ref={rootRef} className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>

      <div className={`${styles.control} ${error ? styles.controlError : ''}`}>
        <button
          ref={buttonRef}
          type="button"
          className={styles.countryButton}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          onClick={() => setOpen((current) => !current)}
        >
          <span className={styles.isoBadge}>{country.iso2}</span>
          <span className={styles.dialCode}>+{country.dialCode}</span>
          <ChevronDown className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true" />
        </button>

        <input
          id={inputId}
          className={styles.input}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalNumber}
          placeholder="50 360 4235"
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(buildPhoneNumber(country, event.target.value))}
        />
      </div>

      {open && (
        <div className={styles.menu} id={listboxId} role="listbox" onKeyDown={handleMenuKeyDown}>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <input
              ref={searchRef}
              className={styles.searchInput}
              value={query}
              placeholder="Search country or code"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className={styles.options}>
            {filteredCountries.map((item) => {
              const selected = item.iso2 === country.iso2 && item.dialCode === country.dialCode;
              return (
                <button
                  key={`${item.iso2}-${item.dialCode}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
                  onClick={() => selectCountry(item)}
                >
                  <span className={styles.optionIso}>{item.iso2}</span>
                  <span className={styles.optionName}>{item.name}</span>
                  <span className={styles.optionCode}>+{item.dialCode}</span>
                  {selected && <Check className={styles.checkIcon} aria-hidden="true" />}
                </button>
              );
            })}
            {filteredCountries.length === 0 && (
              <div className={styles.emptyState}>No country codes found.</div>
            )}
          </div>
        </div>
      )}

      {error ? <p className={styles.errorText}>{error}</p> : hint && <p className={styles.hintText}>{hint}</p>}
    </div>
  );
}
