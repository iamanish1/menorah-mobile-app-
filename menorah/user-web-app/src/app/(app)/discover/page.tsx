'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { CounsellorCard } from '@/components/discover/CounsellorCard';
import { FilterPanel } from '@/components/discover/FilterPanel';
import { Spinner, Button } from '@/components/ui';
import type { CounsellorFilters } from '@/types';

export default function DiscoverPage() {
  const [filters, setFilters]       = useState<CounsellorFilters>({ page: 1, limit: 12 });
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['counsellors', filters],
    queryFn: () => api.getCounsellors(filters),
  });

  const { data: specsData } = useQuery({
    queryKey: ['specializations'],
    queryFn:  () => api.getSpecializations(),
    staleTime: Infinity,
  });

  const { data: langsData } = useQuery({
    queryKey: ['languages'],
    queryFn:  () => api.getLanguages(),
    staleTime: Infinity,
  });

  const counsellors     = data?.data?.counsellors ?? [];
  const pagination      = data?.data?.pagination;
  const specializations = specsData?.data?.specializations ?? [];
  const languages       = langsData?.data?.languages ?? [];

  const handleSearch = useCallback(() => {
    setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
  }, [searchInput]);

  const clearSearch = () => {
    setSearchInput('');
    setFilters((f) => ({ ...f, search: undefined, page: 1 }));
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-6 rounded-[1.75rem] border border-primary-100 bg-primary-50 px-5 py-5 shadow-[0_14px_32px_-26px_rgba(45,122,92,0.5)] dark:border-primary-800 dark:bg-primary-900/70">
        <h1 className="app-page-heading">
          Find your counsellor
        </h1>
        <p className="app-page-subtitle mt-1">
          Browse {pagination?.total ?? ''} certified men&apos;s mental health counsellors
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-primary-100/55" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name or specialization…"
            className="input-field pl-10 pr-10 rounded-full"
          />
          {searchInput && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-primary-100/55 dark:hover:text-primary-50">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button onClick={handleSearch}>Search</Button>
      </div>

      <div className="flex gap-6">
        {/* Filter sidebar – desktop */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-6">
            <FilterPanel
              filters={filters}
              specializations={specializations}
              languages={languages}
              onChange={(f) => setFilters((prev) => ({ ...prev, ...f }))}
            />
          </div>
        </aside>

        {/* Results */}
        <div className="flex-1 min-w-0">
          {/* Mobile filter row */}
          <div className="lg:hidden mb-4">
            <FilterPanel
              filters={filters}
              specializations={specializations}
              languages={languages}
              onChange={(f) => setFilters((prev) => ({ ...prev, ...f }))}
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : counsellors.length === 0 ? (
            <div className="card text-center py-20 text-gray-500 dark:text-primary-100/70">
              <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No counsellors found</p>
              <p className="text-sm mt-1">Try adjusting your filters or search terms</p>
              <Button variant="secondary" className="mt-4" onClick={() => setFilters({ page: 1, limit: 12 })}>
                Clear filters
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500 dark:text-primary-100/70">
                  {isFetching ? 'Updating…' : `Showing ${counsellors.length} of ${pagination?.total ?? counsellors.length} counsellors`}
                </p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {counsellors.map((c) => (
                  <CounsellorCard key={c.id} c={c} />
                ))}
              </div>

              {/* Pagination */}
              {pagination && pagination.pages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button
                    variant="secondary" size="sm"
                    disabled={filters.page === 1}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-gray-500">
                    Page {filters.page} of {pagination.pages}
                  </span>
                  <Button
                    variant="secondary" size="sm"
                    disabled={filters.page === pagination.pages}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
