import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Palette,
  SlidersHorizontal,
  Captions,
  Library,
  HardDrive,
  Info,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
const sections = [
  { id: 'appearance', title: 'Appearance', icon: Palette },
  { id: 'playback', title: 'Playback', icon: SlidersHorizontal },
  { id: 'lyrics', title: 'Lyrics', icon: Captions },
  { id: 'library', title: 'Library', icon: Library },
  { id: 'storage', title: 'Storage', icon: HardDrive },
  { id: 'about', title: 'About', icon: Info },
] as const;
type Section = (typeof sections)[number]['id'];
export function SettingsPage(props: Record<Section, ReactNode> & { onBack: () => void }) {
  const [selected, setSelected] = useState<Section | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const root = useRef<HTMLElement>(null);
  const previous = useRef<Section | null>(null);
  const animation = useWaveMotion();
  useLayoutEffect(() => {
    if (selected) {
      heading.current?.focus({ preventScroll: true });
      root.current?.scrollIntoView({ block: 'start' });
    } else if (previous.current) {
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-settings-section="${previous.current}"]`)
        ?.focus({ preventScroll: true });
      root.current?.scrollIntoView({ block: 'start' });
    }
    previous.current = selected;
  }, [selected]);
  const section = sections.find((s) => s.id === selected);
  return (
    <section
      ref={root}
      className={`settings-page settings-hub ${selected ? 'settings-detail' : ''}`}
      aria-label="Settings"
    >
      <button
        className="text-button settings-back"
        aria-label={selected ? 'Back to settings' : 'Back from settings'}
        onClick={() => (selected ? setSelected(null) : props.onBack())}
      >
        <ArrowLeft size={19} />
        {selected ? 'All settings' : 'Back'}
      </button>
      {section && selected ? (
        <motion.div
          key={selected}
          className="settings-submenu"
          initial={{ opacity: animation.enabled ? 0 : 1, y: animation.enabled ? 8 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={animation.effects}
        >
          <header className="settings-submenu-heading">
            <section.icon size={24} />
            <h2 tabIndex={-1} ref={heading}>
              {section.title}
            </h2>
          </header>
          <div className="settings-page-options">{props[selected]}</div>
        </motion.div>
      ) : (
        <div className="settings-menu-grid">
          {sections.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              className="settings-menu-item"
              data-settings-section={id}
              aria-label={title}
              onClick={() => setSelected(id)}
            >
              <span className="settings-menu-icon">
                <Icon size={24} />
              </span>
              <span className="settings-menu-copy">
                <strong>{title}</strong>
              </span>
              <ChevronRight size={20} />
            </button>
          ))}
        </div>
      )}
      <footer className="settings-hub-footer">
        <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy &amp; rights</a>
        <span>Wave {__WAVE_VERSION__}</span>
      </footer>
    </section>
  );
}
