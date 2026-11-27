import { useT } from '../i18n';

export function SurfaceLoading() {
  const t = useT();
  return (
    <div className="surface-loading" role="status" aria-label={t('Loading view')} aria-busy="true">
      <span className="sr-only">{t('Loading view')}</span>
      <div className="surface-loading-title" aria-hidden="true" />
      <div className="surface-loading-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
