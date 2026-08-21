'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { CounsellorCard } from '@/components/discover/CounsellorCard';
import { FilterPanel } from '@/components/discover/FilterPanel';
import { WellbeingCheckPrompt } from '@/components/wellbeing/WellbeingCheckPrompt';
import { Spinner, Button } from '@/components/ui';
import type { Counsellor, CounsellorFilters } from '@/types';

export default function DiscoverPage() {
  const [filters, setFilters] = useState<CounsellorFilters>({
    page: 1,
    limit: 9,
    sortBy: 'rating',
    sortOrder: 'desc',
  });
  const [searchInput, setSearchInput] = useState('');
  const [visibleCounsellors, setVisibleCounsellors] = useState<Counsellor[]>([]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['counsellors', filters],
    queryFn: () => api.getCounsellors(filters),
  });

  const { data: specsData, isLoading: isSpecializationsLoading } = useQuery({
    queryKey: ['specializations'],
    queryFn: () => api.getSpecializations(),
    staleTime: Infinity,
  });

  const { data: langsData, isLoading: isLanguagesLoading } = useQuery({
    queryKey: ['languages'],
    queryFn: () => api.getLanguages(),
    staleTime: Infinity,
  });

  const counsellors = useMemo(() => data?.data?.counsellors ?? [], [data?.data?.counsellors]);
  const pagination = data?.data?.pagination;
  const specializations = specsData?.data?.specializations ?? [];
  const languages = langsData?.data?.languages ?? [];
  const filterSignature = useMemo(
    () => JSON.stringify({
      search: filters.search ?? '',
      specialization: filters.specialization ?? '',
      language: filters.language ?? '',
      minRating: filters.minRating ?? '',
      minPrice: filters.minPrice ?? '',
      maxPrice: filters.maxPrice ?? '',
      sortBy: filters.sortBy ?? '',
      sortOrder: filters.sortOrder ?? '',
    }),
    [filters]
  );

  useEffect(() => {
    setVisibleCounsellors([]);
  }, [filterSignature]);

  useEffect(() => {
    if (!data?.data?.counsellors) return;

    setVisibleCounsellors((previous) => {
      if ((filters.page ?? 1) <= 1) return counsellors;

      const byId = new Map(previous.map((counsellor) => [counsellor.id, counsellor]));
      counsellors.forEach((counsellor) => byId.set(counsellor.id, counsellor));
      return Array.from(byId.values());
    });
  }, [data?.data?.counsellors, counsellors, filters.page]);

  const handleSearch = useCallback(() => {
    setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
  }, [searchInput]);

  const clearSearch = () => {
    setSearchInput('');
    setFilters((f) => ({ ...f, search: undefined, page: 1 }));
  };

  return (
    <div className="page-container max-w-[1540px]">
      <div className="mb-6 rounded-[1.75rem] border border-primary-100 bg-primary-50 px-5 py-5 shadow-[0_14px_32px_-26px_rgba(45,122,92,0.5)] dark:border-primary-800 dark:bg-primary-900/70">
        <h1 className="app-page-heading">Find your counsellor</h1>
        <p className="app-page-subtitle mt-1">
          Browse {pagination?.total ?? ''} certified men&apos;s mental health counsellors
        </p>
      </div>

      <WellbeingCheckPrompt />

      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-primary-100/55" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name or specialization..."
            className="input-field rounded-full pl-10 pr-10"
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-primary-100/55 dark:hover:text-primary-50"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button onClick={handleSearch}>Search</Button>
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-6">
            <FilterPanel
              filters={filters}
              specializations={specializations}
              languages={languages}
              specializationsLoading={isSpecializationsLoading}
              languagesLoading={isLanguagesLoading}
              onChange={(f) => setFilters((prev) => ({ ...prev, ...f }))}
            />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 lg:hidden">
            <FilterPanel
              filters={filters}
              specializations={specializations}
              languages={languages}
              specializationsLoading={isSpecializationsLoading}
              languagesLoading={isLanguagesLoading}
              onChange={(f) => setFilters((prev) => ({ ...prev, ...f }))}
            />
          </div>

          {isLoading && visibleCounsellors.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : visibleCounsellors.length === 0 ? (
            <div className="card py-20 text-center text-gray-500 dark:text-primary-100/70">
              <Search className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="font-medium">No counsellors found</p>
              <p className="mt-1 text-sm">Try adjusting your filters or search terms</p>
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => setFilters({ page: 1, limit: 9, sortBy: 'rating', sortOrder: 'desc' })}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-primary-100/70">
                  {isFetching && (filters.page ?? 1) === 1
                    ? 'Updating...'
                    : `Showing ${visibleCounsellors.length} of ${pagination?.total ?? visibleCounsellors.length} counsellors`}
                </p>
              </div>

              <div className="counsellor-profile-grid grid gap-5">
                {visibleCounsellors.map((c, index) => (
                  <CounsellorCard key={c.id} c={c} index={index} />
                ))}
              </div>

              {pagination && (filters.page ?? 1) < pagination.pages && (
                <div className="mt-8 flex items-center justify-center">
                  <Button
                    disabled={isFetching}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                  >
                    {isFetching ? 'Loading...' : 'Load More'}
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
