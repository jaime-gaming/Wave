import { ArrowUpRight } from './Glyphs';
import { ANDROID_APP_URL } from '../ui/androidApp';
import { useT } from '../i18n';

/** Quiet download links in About; no promotion or prompt on Home. */
export function PlatformLinks({ onDevices }: { onDevices?: () => void }) {
  const t = useT();
  return (
    <section className="platform-links" aria-label={t('Wave on your devices')}>
      <h3>{t('Wave on your devices')}</h3>
      <div className="platform-secondary">
        <a href={ANDROID_APP_URL} target="_blank" rel="noreferrer">
          {t('Android APK')} <ArrowUpRight size={16} />
        </a>
        <a
          href="https://github.com/jaime-gaming/Wave/releases/latest"
          target="_blank"
          rel="noreferrer"
        >
          {t('Windows portable ZIP')} <ArrowUpRight size={16} />
        </a>
        <a href="https://wave.jaime-gaming.com/" target="_blank" rel="noreferrer">
          {t('Web player')} <ArrowUpRight size={16} />
        </a>
        {onDevices && (
          <button type="button" className="text-button" onClick={onDevices}>
            {t('Link devices in the web player')}
          </button>
        )}
      </div>
      <p className="platform-note">
        {t('Each app keeps its own library. Device linking currently uses the web player.')}
      </p>
    </section>
  );
}
