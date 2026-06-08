'use client';

import { useState } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui';
import type { CounsellorFilters } from '@/types';

interface FilterPanelProps {
  filters: CounsellorFilters;
  specializations: string[];
  languages: string[];
  onChange: (filters: CounsellorFilters) => void;
}

// Each option encodes both sortBy and sortOrder so the backend gets both values
const SORT_OPTIONS = [
  { value: '',                label: 'Relevance (default)' },
  { value: 'rating_desc',     label: 'Highest Rated' },
  { value: 'price_asc',       label: 'Price: Low to High' },
  { value: 'price_desc',      label: 'Price: High to Low' },
  { value: 'experience_desc', label: 'Most Experienced' },
  { value: 'experience_asc',  label: 'Least Experienced' },
] as const;

const RATING_OPTIONS = [
  { value: 0,   label: 'Any rating' },
  { value: 1,   label: '1★ & above' },
  { value: 2,   label: '2★ & above' },
  { value: 3,   label: '3★ & above' },
  { value: 4,   label: '4★ & above' },
  { value: 4.5, label: '4.5★ & above' },
];

export function FilterPanel({ filters, specializations, languages, onChange }: FilterPanelProps) {
  const [local, setLocal] = useState<CounsellorFilters>(filters);

  const set = <K extends keyof CounsellorFilters>(key: K, value: CounsellorFilters[K]) =>
    setLocal((p) => ({ ...p, [key]: value }));

  // Encode sort as a single "field_order" string, decode on change
  const currentSort = local.sortBy ? `${local.sortBy}_${local.sortOrder ?? 'desc'}` : '';

  const handleSortChange = (combined: string) => {
    if (!combined) {
      setLocal((p) => ({ ...p, sortBy: undefined, sortOrder: undefined }));
    } else {
      const [field, order] = combined.split('_') as [CounsellorFilters['sortBy'], 'asc' | 'desc'];
      setLocal((p) => ({ ...p, sortBy: field, sortOrder: order }));
    }
  };

  const apply = () => onChange({ ...local, page: 1 });

  const reset = () => {
    const cleared: CounsellorFilters = {};
    setLocal(cleared);
    onChange({ page: 1 });
  };

  const hasFilters = !!(
    local.specialization || local.language ||
    (local.minRating && local.minRating > 0) ||
    local.minPrice || local.maxPrice || local.sortBy
  );

  return (
    <div className="card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-black text-gray-950 dark:text-primary-50">
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </div>
        {hasFilters && (
          <button
            onClick={reset}
            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 dark:text-red-300"
          >
            <X className="w-3 h-3" /> Clear all
          </button>
        )}
      </div>

      {/* Specialization */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700 dark:text-primary-100">Specialization</label>
        <select
          value={local.specialization || ''}
          onChange={(e) => set('specialization', e.target.value || undefined)}
          className="input-field text-sm"
        >
          <option value="">All specializations</option>
          {specializations.length === 0 && (
            <option disabled>Loading…</option>
          )}
          {specializations.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700 dark:text-primary-100">Language</label>
        <select
          value={local.language || ''}
          onChange={(e) => set('language', e.target.value || undefined)}
          className="input-field text-sm"
        >
          <option value="">Any language</option>
          {languages.length === 0 && (
            <option disabled>Loading…</option>
          )}
          {languages.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* Min Rating */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700 dark:text-primary-100">Minimum Rating</label>
        <select
          value={local.minRating ?? 0}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            set('minRating', v > 0 ? v : undefined);
          }}
          className="input-field text-sm"
        >
          {RATING_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Price Range */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Price Range (₹/hr)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            min={0}
            value={local.minPrice ?? ''}
            onChange={(e) => set('minPrice', e.target.value ? parseInt(e.target.value) : undefined)}
            className="input-field text-sm"
          />
          <span className="text-gray-400 dark:text-primary-100/50 text-sm shrink-0">to</span>
          <input
            type="number"
            placeholder="Max"
            min={0}
            value={local.maxPrice ?? ''}
            onChange={(e) => set('maxPrice', e.target.value ? parseInt(e.target.value) : undefined)}
            className="input-field text-sm"
          />
        </div>
      </div>

      {/* Sort By */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700 dark:text-primary-100">Sort by</label>
        <select
          value={currentSort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="input-field text-sm"
        >
          {SORT_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <Button fullWidth onClick={apply}>Apply Filters</Button>
    </div>
  );
}
