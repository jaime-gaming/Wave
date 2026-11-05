import { useT } from '../i18n';
import { ArrowUpRight, Download, Smartphone } from './Glyphs';
import { ANDROID_APP_URL } from '../ui/androidApp';

/** Discover builds without promising automatic library synchronization. */
export function PlatformLinks({
  compact = false,
  onDevices,
}: {
  compact?: boolean;
  onDevices?: () => void;
}) {
  const t = useT();
  return (
    <section
      className={`platform-links${compact ? ' platform-links-compact' : ''}`}
      aria-label={t('Wave on your devices')}
    >
      <header>
        <h3>{t('Wave on your devices')}</h3>
        <p>{t('Choose where you listen. Your library stays on that device.')}</p>
      </header>
      <div className="platform-android">
        <Smartphone size={24} aria-hidden="true" />
        <div>
          <strong>Wave for Android</strong>
          <p>
            {t('Local playback, lock-screen controls, a home-screen widget and quick settings.')}
          </p>
          {!compact && (
            <small>
              {t(
                'Android 8 or later. Download the APK from Releases and approve installation when Android asks. Current packages are test builds.',
              )}
            </small>
          )}
        </div>
        <a className="tonal-button" href={ANDROID_APP_URL} target="_blank" rel="noreferrer">
          <Download size={17} />
          {t('Android APK')}
        </a>
      </div>
      <div className="platform-secondary">
        <a
          href="https://github.com/jaime-gaming/Wave/releases/latest"
          target="_blank"
          rel="noreferrer"
        >
          {t('Windows portable ZIP')}
          <ArrowUpRight size={16} />
        </a>
        <a href="https://wave.jaime-gaming.com/" target="_blank" rel="noreferrer">
          {t('Web player')}
          <ArrowUpRight size={16} />
        </a>
        {onDevices && (
          <button type="button" className="text-button" onClick={onDevices}>
            {t('Link devices in the web player')}
          </button>
        )}
      </div>
      {!compact && (
        <p className="platform-note">
          {t(
            'Extract the Windows ZIP before opening Wave.Windows.exe. Native libraries do not automatically sync with the web player; use Settings → Devices in the web player to link browsers.',
          )}
        </p>
      )}
    </section>
  );
}
