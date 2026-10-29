import { WaveWordmark } from './WaveWordmark';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import {
  Home,
  Library,
  Search,
  Settings,
  AudioLines,
  Disc3,
  Heart,
  ListMusic,
  Users,
} from 'lucide-react';
import type { LibraryView } from '../domain/types';
export type Page = 'home' | 'search' | 'library' | 'remix' | 'settings';
export function Navigation({
  page,
  onPage,
  onSettings,
  view,
  onView,
  counts,
}: {
  page: Page;
  onPage: (page: Page) => void;
  onSettings: () => void;
  view: LibraryView;
  onView: (view: LibraryView) => void;
  counts: { albums: number; artists: number; playlists: number; favorites: number };
}) {
  const animation = useWaveMotion();
  return (
    <aside className="navigation-shell">
      <a className="brand" href="#main" aria-label="Wave home" onClick={() => onPage('home')}>
        {/* The whole word, in the mark's own line: the logo is the lettering. */}
        <WaveWordmark />
        <span className="sr-only">Wave</span>
      </a>
      <nav className="app-navigation" aria-label="Main navigation">
        {(
          [
            { id: 'home', name: 'Home', icon: Home },
            { id: 'search', name: 'Search', icon: Search },
            { id: 'library', name: 'Library', icon: Library },
            { id: 'remix', name: 'Remix', icon: AudioLines },
          ] as const
        ).map(({ id, name, icon: Icon }) => (
          <motion.button
            key={id}
            whileTap={animation.enabled ? { scale: 0.94 } : undefined}
            whileHover={animation.enabled ? { y: -1 } : undefined}
            transition={animation.wobble}
            aria-current={page === id ? 'page' : undefined}
            className={page === id ? 'selected' : ''}
            onClick={() => onPage(id)}
          >
            {page === id && (
              <motion.span
                className="navigation-selection"
                layoutId="navigation-selection"
                transition={animation.wobble}
              />
            )}
            <span className="navigation-icon">
              <Icon size={23} />
            </span>
            <span className="navigation-label">{name}</span>
          </motion.button>
        ))}
      </nav>
      <div className="rail-collection" role="group" aria-label="Collection shortcuts">
        <p>Collection</p>
        {(
          [
            { id: 'albums', label: 'Albums', name: 'Browse albums', icon: Disc3 },
            { id: 'artists', label: 'Artists', name: 'Browse artists', icon: Users },
            { id: 'playlists', label: 'Playlists', name: 'Browse playlists', icon: ListMusic },
            { id: 'favorites', label: 'Favorites', name: 'Browse favorite songs', icon: Heart },
          ] as const
        ).map(({ id, label, name, icon: Icon }) => (
          <button
            key={id}
            aria-label={name}
            aria-pressed={page === 'library' && view === id}
            onClick={() => onView(id)}
          >
            <Icon size={19} />
            <span>{label}</span>
            <small>{counts[id]}</small>
          </button>
        ))}
      </div>
      <button className="rail-settings" onClick={onSettings} aria-label="Settings">
        <Settings size={21} />
        <span>Settings</span>
      </button>
    </aside>
  );
}
