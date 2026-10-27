import { useEffect, useState } from 'react';

/**
 * Long libraries: rows arrive as the list is scrolled instead of all at once.
 *
 * A thousand songs is a thousand rows, each with buttons, an image and an
 * animated wrapper. The browser then lays out rows nobody is looking at, which
 * is what makes a big library feel slow on a phone. Rows still appear in order
 * and the whole list stays reachable; only the amount that exists at once is
 * bounded.
 */
export function useIncrementalRows(total: number, page = 80) {
  const [limit, setLimit] = useState(page);
  // The sentinel is a DOM node, so a state setter doubles as its ref callback.
  const [sentinel, setSentinel] = useState<HTMLLIElement | null>(null);

  useEffect(() => {
    if (limit >= total || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((value) => value + page);
      },
      // A wide margin, so the next page is ready before it is on screen.
      { rootMargin: '800px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [limit, total, page, sentinel]);

  return { limit: Math.min(limit, total), sentinelRef: setSentinel };
}
