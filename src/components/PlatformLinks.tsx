import { ArrowUpRight } from './Glyphs';
import { ANDROID_APP_URL } from '../ui/androidApp';
import { useT } from '../i18n';

export function PlatformLinks({ onDevices }: { onDevices?: () => void }) {
  const t = useT();
  return (
    <section className="platform-links" aria-label={t('Wave on your devices')}>
      <h3>{t('Wave on your devices')}</h3>
      <div className="platform-secondary">
        <a href={ANDROID_APP_URL}>
          {t('Wave for Android')} <ArrowUpRight size={16} />
        </a>
        <a href="/api/download/windows">
          {t('Wave for Windows')} <ArrowUpRight size={16} />
        </a>
        <a href="https://wave.jaime-gaming.com/" target="_blank" rel="noreferrer">
          {t('Use Wave on iPhone and iPad')} <ArrowUpRight size={16} />
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
        {t(
          'The iPhone and iPad app is not ready to download yet. In Safari, you can add the web player to your Home Screen.',
        )}
      </p>
      <p className="platform-note">
        {t('Each app keeps its own library. Device linking currently uses the web player.')}{' '}
        {t('The Windows download may be an older version and may show a security warning.')}
      </p>
    </section>
  );
}
