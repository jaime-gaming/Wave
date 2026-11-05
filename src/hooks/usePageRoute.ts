import { useCallback, useEffect, useState } from 'react';
import type { Page } from '../components/Navigation';

const pages: Page[] = ['home', 'library', 'search', 'remix', 'settings'];
export function pageFromPath(path: string): Page {
  const segment = path.replace(/\/+$/, '').split('/').pop()?.toLowerCase();
  return pages.find((page) => page === segment) ?? 'home';
}
export function usePageRoute(pairLink: boolean) {
  const [page, update] = useState<Page>(() =>
    pairLink ? 'settings' : pageFromPath(location.pathname),
  );
  const setPage = useCallback((next: Page) => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const path = `${base}/${next === 'home' ? '' : next[0].toUpperCase() + next.slice(1)}`;
    if (location.pathname !== path)
      history.pushState(null, '', path + location.search + location.hash);
    update(next);
  }, []);
  useEffect(() => {
    const pop = () => update(pageFromPath(location.pathname));
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  return [page, setPage] as const;
}
