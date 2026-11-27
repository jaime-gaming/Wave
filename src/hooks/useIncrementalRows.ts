import { useEffect, useState } from 'react';
import { budgetFor, usePerformanceProfile } from '../ui/performance';

export function useIncrementalRows(total: number, page?: number) {
  const profile = usePerformanceProfile();

  const size = page ?? budgetFor(profile).incrementalRows;
  const [limit, setLimit] = useState(size);

  const [sentinel, setSentinel] = useState<HTMLLIElement | null>(null);

  useEffect(() => {
    if (limit >= total || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((value) => value + size);
      },

      { rootMargin: '800px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [limit, total, size, sentinel]);

  // Without IntersectionObserver there is no sentinel callback. Showing every
  // row is preferable to making the rest of the library unreachable.
  const rendered = typeof IntersectionObserver === 'undefined' ? total : Math.min(limit, total);
  return { limit: rendered, sentinelRef: setSentinel };
}
