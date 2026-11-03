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
  Smartphone,
} from './Glyphs';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { useT } from '../i18n';
const sections = [
  { id: 'appearance', title: 'Appearance', note: 'Theme, larger text and motion', icon: Palette },
  { id: 'playback', title: 'Playback', note: 'Mix and local Autoplay', icon: SlidersHorizontal },
  { id: 'lyrics', title: 'Lyrics', note: 'Optional automatic lyric search', icon: Captions },
  { id: 'library', title: 'Library', note: 'Song information and cover editing', icon: Library },
  { id: 'devices', title: 'Devices', note: 'Link a phone, a desktop or a tab', icon: Smartphone },
  { id: 'storage', title: 'Storage', note: 'Your original local files', icon: HardDrive },
  { id: 'about', title: 'About', note: 'Version, source and privacy', icon: Info },
] as const;
type Section = (typeof sections)[number]['id'];
/** The id of a Settings section, for anything that opens Settings on one. */
export type SettingsSection = Section;
export function SettingsPage(
  props: Record<Section, ReactNode> & {
    onBack: () => void;
    /** Opens straight into one section, used by a `#wave-pair=` link. */
    initialSection?: Section | null;
  },
) {
  const t = useT();
  const [selected, setSelected] = useState<Section | null>(props.initialSection ?? null);
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
      aria-label={t('Settings')}
    >
      <button
        className="text-button settings-back"
        aria-label={selected ? t('Back to settings') : t('Back from settings')}
        onClick={() => (selected ? setSelected(null) : props.onBack())}
      >
        <ArrowLeft size={19} />
        {selected ? t('All settings') : t('Back')}
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
              {t(section.title)}
            </h2>
          </header>
          <div className="settings-page-options">{props[selected]}</div>
        </motion.div>
      ) : (
        <div className="settings-menu-grid">
          {sections.map(({ id, title, note, icon: Icon }) => (
            <button
              key={id}
              className="settings-menu-item"
              data-settings-section={id}
              aria-label={t(title)}
              onClick={() => setSelected(id)}
            >
              <span className="settings-menu-icon">
                <Icon size={24} />
              </span>
              <span className="settings-menu-copy">
                <strong>{t(title)}</strong>
                <span>{t(note)}</span>
              </span>
              <ChevronRight size={20} />
            </button>
          ))}
        </div>
      )}
      <footer className="settings-hub-footer">
        <a href={`${import.meta.env.BASE_URL}privacy.html`}>{t('Privacy &amp; rights')}</a>
        <span>Wave {__WAVE_VERSION__}</span>
      </footer>
    </section>
  );
}
