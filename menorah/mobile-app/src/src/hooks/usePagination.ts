import { useState, useCallback } from 'react';

export function usePagination(initialPage = 1, initialLimit = 10) {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [hasMore, setHasMore] = useState(true);

  const nextPage = useCallback(() => {
    setPage(prev => prev + 1);
  }, []);

  const resetPagination = useCallback(() => {
    setPage(initialPage);
    setHasMore(true);
  }, [initialPage]);

  return {
    page,
    limit,
    hasMore,
    setHasMore,
    nextPage,
    resetPagination,
  };
}
