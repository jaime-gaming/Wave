import { useCallback, useEffect, useState } from 'react';
import type { Page } from '../components/Navigation';

const pages: Page[] = ['home', 'search', 'library', 'remix', 'settings'];
export const navigationDirection = (from: Page, to: Page): 1 | -1 =>
  pages.indexOf(to) >= pages.indexOf(from) ? 1 : -1;
export function pageFromPath(path: string): Page {
  const segment = path.replace(/\/+$/, '').split('/').pop()?.toLowerCase();
  return pages.find((page) => page === segment) ?? 'home';
}
export function usePageRoute(pairLink: boolean) {
  const [route, update] = useState(() => ({
    page: pairLink ? ('settings' as Page) : pageFromPath(location.pathname),
    direction: 1 as 1 | -1,
  }));
  const navigate = useCallback(
    (next: Page) =>
      update((previous) =>
        previous.page === next
          ? previous
          : { page: next, direction: navigationDirection(previous.page, next) },
      ),
    [],
  );
  const setPage = useCallback(
    (next: Page) => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const path = `${base}/${next === 'home' ? '' : next[0].toUpperCase() + next.slice(1)}`;
      if (location.pathname !== path)
        history.pushState(null, '', path + location.search + location.hash);
      navigate(next);
    },
    [navigate],
  );
  useEffect(() => {
    const pop = () => navigate(pageFromPath(location.pathname));
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [navigate]);
  return [route.page, setPage, route.direction] as const;
}
