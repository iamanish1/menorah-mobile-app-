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

export function FilterPanel({ filters, specializations, languages, onChange }: FilterPanelProps) {
  const [local, setLocal] = useState<CounsellorFilters>(filters);

  const set = (key: keyof CounsellorFilters, value: unknown) =>
    setLocal((p) => ({ ...p, [key]: value }));

  const apply = () => onChange({ ...local, page: 1 });
  const reset = () => {
    setLocal({});
    onChange({ page: 1 });
  };

  const hasFilters = !!(local.specialization || local.language || local.minRating || local.minPrice || local.maxPrice);

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-gray-900">
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </div>
        {hasFilters && (
          <button onClick={reset} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
            <X className="w-3 h-3" />Clear all
          </button>
        )}
      </div>

      {/* Specialization */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Specialization</label>
        <select
          value={local.specialization || ''}
          onChange={(e) => set('specialization', e.target.value || undefined)}
          className="input-field text-sm"
        >
          <option value="">All specializations</option>
          {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Language</label>
        <select
          value={local.language || ''}
          onChange={(e) => set('language', e.target.value || undefined)}
          className="input-field text-sm"
        >
          <option value="">Any language</option>
          {languages.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Min Rating */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">
          Min Rating: <span className="text-primary-600">{local.minRating ? `${local.minRating}★` : 'Any'}</span>
        </label>
        <input
          type="range" min={0} max={5} step={0.5}
          value={local.minRating ?? 0}
          onChange={(e) => set('minRating', parseFloat(e.target.value) || undefined)}
          className="w-full accent-primary-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>0</span><span>5★</span>
        </div>
      </div>

      {/* Price Range */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Price Range (₹/hr)</label>
        <div className="flex gap-2">
          <input
            type="number" placeholder="Min"
            value={local.minPrice ?? ''}
            onChange={(e) => set('minPrice', e.target.value ? parseInt(e.target.value) : undefined)}
            className="input-field text-sm"
          />
          <input
            type="number" placeholder="Max"
            value={local.maxPrice ?? ''}
            onChange={(e) => set('maxPrice', e.target.value ? parseInt(e.target.value) : undefined)}
            className="input-field text-sm"
          />
        </div>
      </div>

      {/* Sort */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Sort by</label>
        <select
          value={local.sortBy || ''}
          onChange={(e) => set('sortBy', (e.target.value || undefined) as CounsellorFilters['sortBy'])}
          className="input-field text-sm"
        >
          <option value="">Relevance</option>
          <option value="rating">Highest Rated</option>
          <option value="price">Price: Low to High</option>
          <option value="experience">Most Experienced</option>
        </select>
      </div>

      <Button fullWidth onClick={apply}>Apply Filters</Button>
    </div>
  );
}
