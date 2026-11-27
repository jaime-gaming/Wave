import { useCallback, useEffect, useState, useMemo } from 'react';
import { HardDrive, ShieldCheck, RefreshCw } from './Glyphs';
import { AnimatePresence } from 'motion/react';
import { Modal } from './Modal';
import type { Track } from '../domain/types';
import { formatBytes, libraryFootprint, requestPersistentStorage } from '../data/storage';
import { countPlays } from '../data/listening';
import { useT } from '../i18n';
import { RESET_MARKER } from '../data/reset';
import {
  decryptBackup,
  deviceFingerprint,
  encryptBackup,
  exportLibrary,
  isEncryptedBackup,
  prepareLibrary,
  type PreparedBackup,
} from '../data/backup';
export function StorageSettings({
  tracks,
  importing = false,
}: {
  tracks: Track[];
  importing?: boolean;
}) {
  const t = useT();
  const [confirmReset, setConfirmReset] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [openedBackup, setOpenedBackup] = useState<PreparedBackup | null>(null);
  const [sourceFingerprint, setSourceFingerprint] = useState('');
  const [ownFingerprint, setOwnFingerprint] = useState('');
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [restoreStage, setRestoreStage] = useState('');
  const [restoreProgress, setRestoreProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const closeRestore = () => {
    if (backupBusy) return;
    setBackupFile(null);
    setOpenedBackup(null);
    setBackupPassword('');
    setIdentityConfirmed(false);
    setMessage('');
    setRestoreProgress(null);
    setRestoreStage('');
  };

  const footprint = useMemo(() => libraryFootprint(tracks), [tracks]);
  const [usage, setUsage] = useState<number | undefined>(),
    [quota, setQuota] = useState<number | undefined>(),
    [plays, setPlays] = useState<number | undefined>(),
    [persisted, setPersisted] = useState(false),
    [busy, setBusy] = useState(false),
    [backupBusy, setBackupBusy] = useState(false),
    [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    try {
      const info = await navigator.storage?.estimate?.();
      setUsage(info?.usage);
      setQuota(info?.quota);
      setPersisted((await navigator.storage?.persisted?.()) ?? false);
    } catch {
      setMessage(t('This browser cannot say how much space is left.'));
    }
  }, [t]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);

    void deviceFingerprint()
      .then(setOwnFingerprint)
      .catch(() => undefined);
    void countPlays()
      .then(setPlays)
      .catch(() => undefined);
    return () => clearTimeout(timer);
  }, [refresh]);
  return (
    <section className="storage-settings" aria-label={t('Browser storage')}>
      <div className="storage-card storage-overview">
        <h3>
          <HardDrive size={20} />
          {t('Browser storage')}
        </h3>
        <dl>
          <div>
            <dt>{t('Original audio')}</dt>
            <dd>{formatBytes(footprint.audio)}</dd>
          </div>
          <div>
            <dt>{t('Compact covers')}</dt>
            <dd>{formatBytes(footprint.artwork)}</dd>
          </div>
          <div>
            <dt>{t('Saved lyrics')}</dt>
            <dd>{formatBytes(footprint.lyrics)}</dd>
          </div>
          {plays !== undefined && (
            <div>
              <dt>{t('Listening history')}</dt>
              <dd>
                {plays} {t(plays === 1 ? 'play' : 'plays')}
              </dd>
            </div>
          )}
          {usage !== undefined && (
            <div>
              <dt>{t('Space used')}</dt>
              <dd>
                {formatBytes(usage)}
                {quota !== undefined ? ` / ${formatBytes(quota)}` : ''}
              </dd>
            </div>
          )}
        </dl>
        <p className="modal-description">
          {t(
            'Songs are kept from the moment you add them, even if you never play them. The same file is never stored twice, and nothing is re-encoded: the audio stays exactly as it arrived.',
          )}
        </p>
        <div className="storage-actions">
          <button
            className="tonal-button"
            disabled={busy || persisted}
            onClick={async () => {
              setBusy(true);
              const protectedStorage = await requestPersistentStorage();
              setPersisted(protectedStorage);
              setMessage(
                protectedStorage
                  ? t('Your files are protected: the browser will not clear them to make room.')
                  : t(
                      'The browser would not promise to keep them. Open Wave in its own tab and try again.',
                    ),
              );
              await refresh();
              setBusy(false);
            }}
          >
            <ShieldCheck size={18} />
            {persisted ? t('Storage protected') : t('Protect stored files')}
          </button>
          <button
            className="icon-button"
            aria-label={t('Refresh storage estimate')}
            onClick={() => void refresh()}
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>
      {message && !backupFile && (
        <p className="storage-message" role="status">
          {message}
        </p>
      )}
      <div className="storage-card storage-backup">
        <h3>{t('Library backup')}</h3>
        <p>
          {t(
            'Save your songs, playlists and listening history in one file. Settings, device links and remembered folders are not included.',
          )}
        </p>
        <p>
          {t(
            'Restore a backup into an empty Wave library. It will not overwrite an existing library. Close other Wave tabs first.',
          )}
        </p>
        <p>
          {t(
            'Encrypted backups use a password and a device signature. Save the password: Wave cannot recover it.',
          )}
        </p>
        {ownFingerprint && (
          <p className="backup-fingerprint">
            {t('This device fingerprint')}: <code>{ownFingerprint}</code>
          </p>
        )}
        {!backupFile && (
          <div className="backup-fields">
            <label>
              {t('Backup password')}
              <input
                type="password"
                autoComplete="new-password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
              />
            </label>
            <label>
              {t('Confirm password')}
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            <p>{t('Use at least 10 characters and keep the device fingerprint separately.')}</p>
          </div>
        )}
        <div className="storage-actions">
          <button
            type="button"
            className="tonal-button"
            disabled={backupBusy || importing || !!backupFile}
            onClick={async () => {
              if (backupPassword.length < 10 || backupPassword !== confirmPassword) {
                setMessage(t('Enter matching backup passwords of at least 10 characters.'));
                return;
              }
              setBackupBusy(true);
              setMessage('');
              try {
                const { file, fingerprint } = await encryptBackup(
                  await exportLibrary(),
                  backupPassword,
                );
                const url = URL.createObjectURL(file);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'Wave-library.wavebackup';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
                setOwnFingerprint(fingerprint);
                setBackupPassword('');
                setConfirmPassword('');
                setMessage(
                  t(
                    'Your encrypted backup is ready. Save its password and compare the device fingerprint when restoring.',
                  ),
                );
              } catch {
                setMessage(t('Could not export the library. Please try again.'));
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            {t('Export library')}
          </button>
          <label
            className={`tonal-button storage-import${backupBusy || importing || tracks.length ? ' is-disabled' : ''}`}
          >
            {t('Import library')}
            <input
              type="file"
              accept=".wavebackup"
              disabled={backupBusy || importing || tracks.length > 0}
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                setBackupFile(file);
                setOpenedBackup(null);
                setIdentityConfirmed(false);
                setSkipDuplicates(false);
                setBackupPassword('');
                setConfirmPassword('');
                setMessage('');
                setBackupBusy(true);
                setRestoreStage('Checking the backup');
                setRestoreProgress(null);
                try {
                  const encrypted = await isEncryptedBackup(file);
                  setLegacy(!encrypted);
                  if (!encrypted) {
                    setRestoreStage('Checking songs for duplicates');
                    setOpenedBackup(
                      await prepareLibrary(file, (done, total) =>
                        setRestoreProgress({ done, total }),
                      ),
                    );
                  }
                } catch {
                  setBackupFile(null);
                  setMessage(
                    t(
                      'The backup is invalid or contains conflicting records. Nothing was restored.',
                    ),
                  );
                } finally {
                  setBackupBusy(false);
                }
              }}
            />
          </label>
        </div>
        <AnimatePresence>
          {backupFile && (
            <Modal
              title={t('Restore your library')}
              fullScreen
              className="backup-restore-dialog"
              onClose={closeRestore}
              closeDisabled={backupBusy}
            >
              <div className="backup-review">
                <p>
                  {t(
                    'Your existing library will not be overwritten. Verify the backup before restoring.',
                  )}
                </p>
                {message && (
                  <p className="backup-restore-error" role="alert">
                    {message}
                  </p>
                )}
                {backupBusy && (
                  <div className="backup-progress" role="status">
                    <p>{t(restoreStage || 'Preparing your library. Please keep Wave open.')}</p>
                    {restoreProgress && restoreProgress.total > 0 && (
                      <progress
                        value={restoreProgress.done}
                        max={restoreProgress.total}
                        aria-label={t(restoreStage)}
                      />
                    )}
                    <p>{t('Please keep Wave open until this step finishes.')}</p>
                  </div>
                )}
                {!legacy && !openedBackup && (
                  <>
                    <label>
                      {t('Backup password')}
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={backupPassword}
                        onChange={(e) => setBackupPassword(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="tonal-button"
                      disabled={backupBusy || !backupPassword}
                      onClick={async () => {
                        setBackupBusy(true);
                        setMessage('');
                        setRestoreStage('Unlocking and verifying the backup');
                        setRestoreProgress(null);
                        try {
                          const result = await decryptBackup(
                            backupFile,
                            backupPassword,
                            (done, total) => setRestoreProgress({ done, total }),
                          );
                          setRestoreStage('Checking songs for duplicates');
                          setRestoreProgress(null);
                          const prepared = await prepareLibrary(result.archive, (done, total) =>
                            setRestoreProgress({ done, total }),
                          );
                          setOpenedBackup(prepared);
                          setSourceFingerprint(result.fingerprint);
                          setBackupPassword('');
                        } catch {
                          setMessage(t('Wrong password or damaged backup. Nothing was restored.'));
                        } finally {
                          setBackupBusy(false);
                        }
                      }}
                    >
                      {t('Verify backup')}
                    </button>
                  </>
                )}
                {openedBackup && (
                  <>
                    <p>
                      {t('Songs to restore')}: {openedBackup.tracks} · {t('Playlists')}:{' '}
                      {openedBackup.playlists} · {t('Exact duplicates found')}:{' '}
                      {openedBackup.duplicates}
                    </p>
                    {openedBackup.duplicates > 0 && (
                      <>
                        <label className="backup-confirm">
                          <input
                            type="checkbox"
                            checked={skipDuplicates}
                            onChange={(e) => setSkipDuplicates(e.target.checked)}
                          />
                          {t('Skip exact duplicates')}
                        </label>
                        <p>
                          {t(
                            'If skipped, playlist and listening references follow the first song and its metadata is kept.',
                          )}
                        </p>
                      </>
                    )}
                    {legacy ? (
                      <p>
                        {t(
                          'This older backup has no encryption or device signature. Its origin and integrity cannot be verified.',
                        )}
                      </p>
                    ) : (
                      <>
                        <p>
                          {t(
                            'Compare this fingerprint with the one saved from the original device. A valid signature alone does not identify its owner.',
                          )}
                        </p>
                        <p className="backup-fingerprint">
                          <code>{sourceFingerprint}</code>
                        </p>
                        <label className="backup-confirm">
                          <input
                            type="checkbox"
                            checked={identityConfirmed}
                            onChange={(e) => setIdentityConfirmed(e.target.checked)}
                          />
                          {t('I compared the device fingerprint.')}
                        </label>
                      </>
                    )}
                    <button
                      type="button"
                      className="tonal-button"
                      disabled={
                        backupBusy ||
                        importing ||
                        tracks.length > 0 ||
                        (!legacy && !identityConfirmed)
                      }
                      onClick={async () => {
                        setBackupBusy(true);
                        setMessage('');
                        setRestoreStage('Saving your library');
                        setRestoreProgress(null);
                        try {
                          await openedBackup.restore(skipDuplicates);
                          window.location.reload();
                        } catch {
                          setMessage(
                            t(
                              'Could not restore this backup. Check the file and make sure the library is empty.',
                            ),
                          );
                          setBackupBusy(false);
                        }
                      }}
                    >
                      {t('Restore library')}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="text-button"
                  disabled={backupBusy}
                  onClick={closeRestore}
                >
                  {t('Cancel')}
                </button>
              </div>
            </Modal>
          )}
        </AnimatePresence>
        {backupBusy && !backupFile && (
          <p role="status">{t('Preparing your library. Please keep Wave open.')}</p>
        )}
      </div>
      <div className="storage-card storage-reset">
        <h3>{t('Reset Wave')}</h3>
        <p>
          {t(
            'Remove all Wave data in this browser: saved music, playlists, history, settings and device links. This cannot be undone.',
          )}
        </p>
        <p>
          {t(
            'Your original files and data on other devices will not be deleted. Keep a backup and close other Wave tabs first.',
          )}
        </p>
        {confirmReset ? (
          <div role="group" aria-label={t('Confirm reset')}>
            <button type="button" className="text-button" onClick={() => setConfirmReset(false)}>
              {t('Cancel')}
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={importing || backupBusy}
              onClick={() => {
                try {
                  sessionStorage.setItem(RESET_MARKER, 'true');
                  window.location.reload();
                } catch {
                  setMessage(t('Wave could not start the reset. Please try again.'));
                }
              }}
            >
              {t('Erase Wave data')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="tonal-button"
            disabled={importing || backupBusy}
            onClick={() => setConfirmReset(true)}
          >
            {t('Reset Wave')}
          </button>
        )}
        {importing && <p>{t('Wait for your music to finish being added.')}</p>}
      </div>
    </section>
  );
}
