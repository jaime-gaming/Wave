import { useCallback, useEffect, useState } from 'react';
import type { Page } from '../components/Navigation';
import type { SettingsSection } from '../components/SettingsPage';
import type { LibraryView } from '../domain/types';

const pages: Page[] = ['home', 'search', 'library', 'remix', 'settings'];
const libraryViews: LibraryView[] = ['songs', 'albums', 'artists', 'playlists', 'favorites'];
const settingsSections: SettingsSection[] = [
  'appearance',
  'playback',
  'lyrics',
  'library',
  'devices',
  'storage',
  'about',
];

export interface AppRoute {
  page: Page;
  overlay?: 'current' | 'queue';
  view?: LibraryView;
  group?: string | null;
  playlistId?: string | null;
  settingsSection?: SettingsSection | null;
  query?: string;
}

const cap = (value: string) =>
  typeof value === 'string' && value ? value[0].toUpperCase() + value.slice(1) : '';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const navigationDirection = (from: Page, to: Page): 1 | -1 =>
  pages.indexOf(to) >= pages.indexOf(from) ? 1 : -1;

export function parseAppRoute(path: string, search = ''): AppRoute {
  const rawSegments = path
    .replace(/^\/+|\/+$/gu, '')
    .split('/')
    .filter(Boolean);

  const roots = new Set<string>([...pages, 'current', 'queue']);
  const rootIndex = rawSegments.findIndex((segment) => roots.has(segment.toLowerCase()));
  if (rootIndex < 0) return { page: 'home' };

  const [head, second, third] = rawSegments.slice(rootIndex);
  const headLower = head.toLowerCase();

  if (headLower === 'current') return { page: 'home', overlay: 'current' };
  if (headLower === 'queue') return { page: 'home', overlay: 'queue' };

  if (headLower === 'settings') {
    const matched = second
      ? (settingsSections.find((s) => s === second.toLowerCase()) ?? null)
      : null;
    return { page: 'settings', settingsSection: matched };
  }

  if (headLower === 'library') {
    const view =
      (second ? libraryViews.find((v) => v === second.toLowerCase()) : undefined) ?? 'songs';
    const detail = third ? safeDecode(third) : null;
    if (view === 'playlists') {
      return { page: 'library', view, playlistId: detail, group: null };
    }
    if (view === 'albums' || view === 'artists') {
      return { page: 'library', view, group: detail, playlistId: null };
    }
    return { page: 'library', view, group: null, playlistId: null };
  }

  if (headLower === 'search') {
    const params = new URLSearchParams(search);
    return { page: 'search', query: params.get('q') ?? '' };
  }

  const matchedPage = pages.find((p) => p === headLower) ?? 'home';
  return { page: matchedPage };
}

export function formatAppRoute(route: AppRoute, baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl.replace(/\/+$/u, '');
  if (route.overlay === 'current') return `${base}/Current`;
  if (route.overlay === 'queue') return `${base}/Queue`;
  if (route.page === 'home') return `${base}/`;
  if (route.page === 'remix') return `${base}/Remix`;
  if (route.page === 'search') {
    const q = route.query?.trim();
    return q ? `${base}/Search?q=${encodeURIComponent(q)}` : `${base}/Search`;
  }
  if (route.page === 'settings') {
    return route.settingsSection
      ? `${base}/Settings/${cap(route.settingsSection)}`
      : `${base}/Settings`;
  }

  if (!route.view || (route.view === 'songs' && !route.group && !route.playlistId)) {
    return `${base}/Library`;
  }
  if (route.view === 'playlists' && route.playlistId) {
    return `${base}/Library/Playlists/${encodeURIComponent(route.playlistId)}`;
  }
  if ((route.view === 'albums' || route.view === 'artists') && route.group) {
    return `${base}/Library/${cap(route.view)}/${encodeURIComponent(route.group)}`;
  }
  return `${base}/Library/${cap(route.view)}`;
}

export function pageFromPath(path: string): Page {
  return parseAppRoute(path).page;
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
      const path = `${base}/${next === 'home' ? '' : cap(next)}`;
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
