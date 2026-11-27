import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Camera, Check, Copy, Link2, QrCode, RotateCcw, Trash2 } from './Glyphs';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { useDevices, readPairingLink } from '../hooks/useDevices';
import { QrScanner } from './QrScanner';
import { borrowedName } from '../sync/fileName';
import { getLoanedAudio } from '../sync/store';
import type { Track } from '../domain/types';

import { useT } from '../i18n';
const kb = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const failureText = (reason: string) =>
  ({
    timeout: 'The code expired before the other device answered. Show a new one.',
    rejected: 'The other device declined.',
    'unsupported-version': 'That device runs a different version of Wave.',
    self: 'That is this device. Use the other one to scan.',
    authentication: 'The two devices did not recognise each other. Start again.',
    replay: 'A message arrived twice and was refused. Start again.',
    protocol: 'The two devices could not agree on how to talk. Make sure both run the same Wave.',
    transport: 'The connection closed. Nothing was lost. Start again when you are ready.',
  })[reason] ?? 'The link failed. Nothing was changed.';

export function DevicesPage({
  tracks,
  onAddLoaned,
}: {
  tracks: Track[];
  onAddLoaned: (blob: Blob, name: string) => Promise<void>;
}) {
  const t = useT();
  const devices = useDevices(tracks);
  const animation = useWaveMotion();
  const [scanning, setScanning] = useState<null | 'invite' | 'reply'>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);

  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState(false);

  const [loaned, setLoaned] = useState<{ text: string; failed: boolean } | null>(() => {
    const address = location.hash || location.search;
    return /wave-pair=/u.test(address) && !readPairingLink(address)
      ? { text: t('That link is not a Wave pairing link.'), failed: true }
      : null;
  });
  const entries = useMemo(() => devices.peerLibrary?.entries ?? [], [devices.peerLibrary]);

  const keepLoan = async (loanId: string, title: string | undefined) => {
    const blob = await getLoanedAudio(loanId);
    if (!blob) {
      setLoaned({ text: t('That copy is no longer on this device.'), failed: true });
      return;
    }
    try {
      await onAddLoaned(blob, borrowedName(title, blob.type));
      setLoaned({
        text: t('Kept “{title}” in your library.', { title: title ?? t('the song') }),
        failed: false,
      });
    } catch {
      setLoaned({ text: t('The song could not be added. Nothing was changed.'), failed: true });
    }
  };
  useEffect(() => {
    if (!loaned) return;
    const timer = setTimeout(() => setLoaned(null), 4000);
    return () => clearTimeout(timer);
  }, [loaned]);

  const [incoming, setIncoming] = useState(() => readPairingLink(location.hash || location.search));
  useEffect(() => {
    if (incoming) history.replaceState(null, '', location.pathname);
  }, [incoming]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(devices.link);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  };

  const share = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: 'Wave', url: devices.link });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      await copy();
    }
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const scan = (value: string) => {
    setScanning(null);
    void (scanning === 'reply' ? devices.acceptReply(value) : devices.join(value));
  };

  const submitPaste = () => {
    const value = pasted.trim();
    if (!value) return;
    const asLink = readPairingLink(value);
    const asCode = value.startsWith('wave1.') ? value : null;
    if (!asLink && !asCode) {
      setPasteError(true);
      return;
    }
    setPasted('');
    setPasteError(false);

    const payload = asLink ?? asCode!;
    void (devices.stage === 'show-code' ? devices.acceptReply(payload) : devices.join(payload));
  };

  return (
    <div className="devices-page">
      <p className="devices-intro">
        {t(
          "Link two devices to listen to each other's songs. Nothing is uploaded: the two browsers talk directly, and only the songs you pick are copied. A link is remembered, so you will not have to do this again.",
        )}
      </p>

      {incoming && (
        <section className="devices-card devices-confirm" aria-label={t('Incoming device link')}>
          <strong>{t('Connect this device?')}</strong>
          <p>
            {t(
              'Only continue if you trust the person who shared this link. You will still need to compare the six digits on both devices.',
            )}
          </p>
          <div className="devices-actions">
            <button
              className="primary-button"
              onClick={() => {
                const payload = incoming;
                setIncoming(null);
                void devices.join(payload);
              }}
            >
              {t('Continue')}
            </button>
            <button className="text-button" onClick={() => setIncoming(null)}>
              {t('Cancel')}
            </button>
          </div>
        </section>
      )}
      {devices.busy && (
        <p role="status">{t('Preparing a secure connection and gathering network addresses…')}</p>
      )}
      {devices.confirmCode && (
        <motion.section
          className="devices-card devices-confirm"
          initial={{ opacity: animation.enabled ? 0 : 1, y: animation.enabled ? 8 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={animation.effects}
        >
          <strong>{t('Check both screens')}</strong>
          <p>
            {t(
              'Both devices must show the same six digits. If they differ, close this and show a fresh code.',
            )}
          </p>
          <div className="devices-code" aria-label={t('Pairing code')}>
            {devices.confirmCode.split('').map((digit, index) => (
              <span key={index}>{digit}</span>
            ))}
          </div>
          <div className="devices-actions">
            <button className="primary-button" onClick={devices.confirm}>
              {t('They match')}
            </button>
            <button className="text-button" onClick={devices.reset}>
              {t('Cancel')}
            </button>
          </div>
        </motion.section>
      )}

      {devices.stage === 'idle' && !incoming && (
        <div className="devices-grid">
          <section className="devices-card">
            <h3>
              <QrCode size={18} aria-hidden="true" /> {t('Show a code')}
            </h3>
            <p>
              {t('Put this screen in front of the other device. It reads the code; you scan back.')}
            </p>
            <div className="devices-actions">
              <button className="primary-button" disabled={devices.busy} onClick={devices.invite}>
                <QrCode size={16} /> {t('Show my code')}
              </button>
            </div>
          </section>
          <section className="devices-card">
            <h3>
              <Camera size={18} aria-hidden="true" /> {t('Read a code')}
            </h3>
            <p>{t('Already have a code on the other screen? Point this camera at it.')}</p>
            <div className="devices-actions">
              <button
                className="primary-button"
                disabled={devices.busy}
                onClick={() => setScanning('invite')}
              >
                <Camera size={16} /> {t('Scan a code')}
              </button>
            </div>
          </section>
        </div>
      )}

      {(devices.stage === 'idle' || devices.stage === 'show-code') && (
        <section className="devices-card devices-paste">
          <h3>
            <Link2 size={18} aria-hidden="true" /> {t('Paste a code')}
          </h3>
          <p>
            {t(
              'No camera on hand? Copy the code from the other device and put it here. On two computers this is the quickest way.',
            )}
          </p>
          <label className="devices-paste-field">
            <span className="sr-only">{t('Pairing code from the other device')}</span>
            <input
              value={pasted}
              spellCheck={false}
              autoComplete="off"
              placeholder={t('wave1.…')}
              onChange={(event) => {
                setPasted(event.target.value);
                setPasteError(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitPaste();
              }}
            />
            <button
              type="button"
              className="tonal-button"
              disabled={!pasted.trim() || devices.busy}
              onClick={submitPaste}
            >
              {t('Use it')}
            </button>
          </label>
          {pasteError && (
            <p className="devices-error" role="alert">
              {t(
                'That does not look like a Wave code. Copy all of it, including the part that starts with wave1.',
              )}
            </p>
          )}
        </section>
      )}

      {(devices.stage === 'show-code' || devices.stage === 'show-reply') && (
        <section className="devices-card devices-qr">
          <h3>
            <QrCode size={18} aria-hidden="true" />
            {devices.stage === 'show-code'
              ? t('Scan this with the other device')
              : t('Now let the other device scan this')}
          </h3>
          <p>
            {devices.stage === 'show-code'
              ? t('It will show a code of its own. Come back here to scan that one.')
              : t('When it has read this, the two devices will be linked.')}
          </p>
          <img src={devices.qr} alt={t('Wave pairing code')} className="devices-qr-image" />
          <label className="devices-share-link">
            <span>{t('Pairing link')}</span>
            <input
              readOnly
              value={devices.link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          {copyFailed && (
            <p className="devices-error" role="alert">
              {t('Could not copy the link. Select it above and copy it yourself.')}
            </p>
          )}
          <div className="devices-actions">
            <button className="tonal-button" onClick={() => void share()}>
              <Link2 size={16} /> {t('Share link')}
            </button>
            <button className="tonal-button" onClick={() => void copy()}>
              <Copy size={16} /> {copied ? t('Link copied') : t('Copy link')}
            </button>
            {devices.stage === 'show-code' ? (
              <button className="primary-button" onClick={() => setScanning('reply')}>
                <Camera size={16} /> {t('Scan their reply')}
              </button>
            ) : null}
            <button className="text-button" onClick={devices.reset}>
              {t('Start over')}
            </button>
          </div>
        </section>
      )}

      {devices.error && (
        <p className="devices-error" role="alert">
          {devices.error}
        </p>
      )}
      {devices.status.kind === 'failed' && (
        <p className="devices-error" role="alert">
          {t(failureText(devices.status.reason))}
        </p>
      )}

      {devices.connected && (
        <section className="devices-card">
          <div className="devices-connected">
            <span className="devices-dot" aria-hidden="true" />
            <strong>{devices.peerName || t('Linked device')}</strong>
            <button className="text-button" onClick={devices.reset}>
              {t('Disconnect')}
            </button>
          </div>
          <p className="devices-note">
            {t(
              'The link stays remembered. Next time, scanning one code is enough. The six digits are skipped because the two devices already know each other.',
            )}
          </p>
          {devices.progress && (
            <p className="devices-note" role="status">
              {devices.progress.total > 0
                ? t('Receiving songs… {received} of {total}', {
                    received: devices.progress.received,
                    total: devices.progress.total,
                  })
                : t('Preparing the songs…')}
            </p>
          )}
          {!entries.length && <p className="devices-note">{t('Waiting for its library…')}</p>}
          {!!entries.length && (
            <>
              <p className="devices-note">
                {t(
                  'Bring songs while both devices are connected. The copies stay here even when the other device is off.',
                )}
              </p>
              <div className="devices-list-head">
                <span>{t('{count} songs on the other device', { count: entries.length })}</span>
                <button
                  className="text-button"
                  onClick={() =>
                    setSelected(
                      selected.size === entries.length
                        ? new Set()
                        : new Set(entries.map((entry) => entry.trackId)),
                    )
                  }
                >
                  {selected.size === entries.length ? t('Clear selection') : t('Select all')}
                </button>
                <button
                  className="primary-button"
                  disabled={!selected.size}
                  onClick={() => {
                    void devices.request(entries.filter((entry) => selected.has(entry.trackId)));
                    setSelected(new Set());
                  }}
                >
                  {selected.size ? t('Bring {count}', { count: selected.size }) : t('Select songs')}
                </button>
              </div>
              <ul className="devices-songs">
                {entries.map((entry) => (
                  <li key={entry.trackId}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(entry.trackId)}
                        onChange={() => toggle(entry.trackId)}
                      />
                      <span>
                        <strong>{entry.title}</strong>
                        <small>
                          {entry.artist} · {kb(entry.size)}
                        </small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="devices-card">
        <h3>
          <Link2 size={18} aria-hidden="true" /> {t('Remembered devices')}
        </h3>
        {!devices.devices.length && (
          <p className="devices-note">
            {t('No device linked yet. Devices you link stay in this list until you remove them.')}
          </p>
        )}
        {!!devices.devices.length && (
          <ul className="devices-device-list">
            {devices.devices.map((device) => {
              const summary = devices.summaries.find((item) => item.deviceId === device.deviceId);
              return (
                <li key={device.deviceId}>
                  <span>
                    <strong>{device.name}</strong>
                    <small>
                      {summary
                        ? `${t('{count} borrowed', { count: summary.tracks })} · ${kb(summary.bytes)}`
                        : t('nothing borrowed')}
                    </small>
                  </span>
                  {confirming === device.deviceId ? (
                    <>
                      <button
                        className="text-button danger"
                        onClick={async () => {
                          await devices.removeDevice(device.deviceId);
                          setConfirming(null);
                        }}
                      >
                        {t('Remove for good')}
                      </button>
                      <button className="text-button" onClick={() => setConfirming(null)}>
                        {t('Keep')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="icon-button"
                        aria-label={t('Link to {name} again', { name: device.name })}
                        onClick={devices.invite}
                      >
                        <RotateCcw size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t('Forget {name}', { name: device.name })}
                        onClick={() => setConfirming(device.deviceId)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="devices-card">
        <h3>{t('Borrowed songs')}</h3>
        <p className="devices-note">
          {t(
            'These copies are available here even when the other device is off. Add them to your library to play them.',
          )}
        </p>
        <p className="devices-note">
          {t(
            '{used} of {capacity} used. Nothing here is ever removed automatically: a song that does not fit is refused, and you decide what to hand back.',
            { used: kb(devices.usedBytes), capacity: kb(devices.capacityBytes) },
          )}
        </p>
        {loaned && (
          <p className={loaned.failed ? 'devices-error' : 'devices-note'} role="status">
            {loaned.text}
          </p>
        )}
        {!devices.loans.length && <p className="devices-note">{t('Nothing borrowed.')}</p>}
        {!!devices.loans.length && (
          <ul className="devices-song-loans">
            {devices.loans.map((loan) => (
              <li key={loan.loanId}>
                <span>
                  <strong>{loan.title ?? t('Borrowed song')}</strong>
                  <small>
                    {loan.artist ?? t('From a linked device')} · {kb(loan.size)}
                  </small>
                </span>
                <button
                  className="text-button"
                  onClick={() => void keepLoan(loan.loanId, loan.title)}
                >
                  <Check size={15} /> {t('Add to library')}
                </button>
                <button
                  className="icon-button"
                  aria-label={t('Remove {title}', {
                    title: loan.title ?? t('Borrowed song'),
                  })}
                  onClick={() => void devices.removeLoan(loan.loanId)}
                >
                  <Trash2 size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!devices.connected && !devices.confirmCode && devices.stage === 'idle' && (
        <p className="devices-note">
          {t('On the other device, open Wave → Settings → Devices and scan this screen.')}{' '}
          <ArrowRight size={14} aria-hidden="true" />
        </p>
      )}

      {scanning && <QrScanner onResult={scan} onCancel={() => setScanning(null)} />}
    </div>
  );
}
