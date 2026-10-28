import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Camera, Check, Copy, Link2, QrCode, RotateCcw, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { useDevices, readPairingLink } from '../hooks/useDevices';
import { QrScanner } from './QrScanner';
import type { Track } from '../domain/types';

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
    authentication: 'The two devices did not agree on the same key. Start again.',
    replay: 'A message arrived twice and was refused. Start again.',
    protocol: 'The two devices are not speaking the same protocol.',
    transport: 'The connection closed. Nothing was lost. Start again when you are ready.',
  })[reason] ?? 'The link failed. Nothing was changed.';

/**
 * Devices.
 *
 * One way in, and one only: a QR code. This device shows one, or it reads one.
 * Two scans and the two devices are linked — no typing, no copying, no codes to
 * read out — because a pairing that takes a sentence to explain is a pairing
 * people do not finish.
 *
 * Opening the link works too, for the case where the two devices cannot see each
 * other's screens: the QR *is* a link, and opening it lands here with the invite
 * already in hand.
 */
export function DevicesPage({
  tracks,
  onAddLoaned,
}: {
  tracks: Track[];
  onAddLoaned: (blob: Blob, name: string) => Promise<void>;
}) {
  const devices = useDevices(tracks);
  const animation = useWaveMotion();
  const [scanning, setScanning] = useState<null | 'invite' | 'reply'>(null);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const entries = useMemo(() => devices.peerLibrary?.entries ?? [], [devices.peerLibrary]);

  // Opening a `#wave-pair=` link on this device joins straight away — once, not
  // on every render, and with the address cleaned so a refresh does not retry.
  const joined = useRef(false);
  useEffect(() => {
    if (joined.current) return;
    const payload = readPairingLink(location.hash || location.search);
    if (!payload) return;
    joined.current = true;
    history.replaceState(null, '', location.pathname);
    void devices.join(payload);
  }, [devices]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(devices.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
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

  return (
    <div className="devices-page">
      <p className="devices-intro">
        Link two devices to listen to each other's songs. Nothing is uploaded: the two browsers talk
        directly, and only the songs you pick are copied. A link is remembered, so you will not have
        to do this again.
      </p>

      {devices.confirmCode && (
        <motion.section
          className="devices-card devices-confirm"
          initial={{ opacity: animation.enabled ? 0 : 1, y: animation.enabled ? 8 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={animation.effects}
        >
          <strong>Check both screens</strong>
          <p>
            Both devices must show the same six digits. If they differ, close this and show a fresh
            code.
          </p>
          <div className="devices-code" aria-label="Pairing code">
            {devices.confirmCode.split('').map((digit, index) => (
              <span key={index}>{digit}</span>
            ))}
          </div>
          <div className="devices-actions">
            <button className="primary-button" onClick={devices.confirm}>
              They match
            </button>
            <button className="text-button" onClick={devices.reset}>
              Cancel
            </button>
          </div>
        </motion.section>
      )}

      {devices.stage === 'idle' && (
        <div className="devices-grid">
          <section className="devices-card">
            <h3>
              <QrCode size={18} aria-hidden="true" /> Show a code
            </h3>
            <p>Put this screen in front of the other device. It reads the code; you scan back.</p>
            <div className="devices-actions">
              <button className="primary-button" disabled={devices.busy} onClick={devices.invite}>
                <QrCode size={16} /> Show my code
              </button>
            </div>
          </section>
          <section className="devices-card">
            <h3>
              <Camera size={18} aria-hidden="true" /> Read a code
            </h3>
            <p>Already have a code on the other screen? Point this camera at it.</p>
            <div className="devices-actions">
              <button
                className="primary-button"
                disabled={devices.busy}
                onClick={() => setScanning('invite')}
              >
                <Camera size={16} /> Scan a code
              </button>
            </div>
          </section>
        </div>
      )}

      {(devices.stage === 'show-code' || devices.stage === 'show-reply') && (
        <section className="devices-card devices-qr">
          <h3>
            <QrCode size={18} aria-hidden="true" />
            {devices.stage === 'show-code'
              ? 'Scan this with the other device'
              : 'Now let the other device scan this'}
          </h3>
          <p>
            {devices.stage === 'show-code'
              ? 'It will show a code of its own. Come back here to scan that one.'
              : 'When it has read this, the two devices will be linked.'}
          </p>
          <img src={devices.qr} alt="Wave pairing code" className="devices-qr-image" />
          <div className="devices-actions">
            <button className="tonal-button" onClick={() => void copy()}>
              <Copy size={16} /> {copied ? 'Link copied' : 'Copy link'}
            </button>
            {devices.stage === 'show-code' ? (
              <button className="primary-button" onClick={() => setScanning('reply')}>
                <Camera size={16} /> Scan their reply
              </button>
            ) : null}
            <button className="text-button" onClick={devices.reset}>
              Start over
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
          {failureText(devices.status.reason)}
        </p>
      )}

      {devices.connected && (
        <section className="devices-card">
          <div className="devices-connected">
            <span className="devices-dot" aria-hidden="true" />
            <strong>{devices.peerName || 'Linked device'}</strong>
            <button className="text-button" onClick={devices.reset}>
              Disconnect
            </button>
          </div>
          <p className="devices-note">
            The link stays remembered. Next time, scanning one code is enough. The six digits are
            skipped because both devices already know each other's key.
          </p>
          {devices.progress && (
            <p className="devices-note" role="status">
              {devices.progress.total > 0
                ? `Receiving ${devices.progress.received} of ${devices.progress.total} pieces…`
                : 'Preparing the songs…'}
            </p>
          )}
          {!entries.length && <p className="devices-note">Waiting for its library…</p>}
          {!!entries.length && (
            <>
              <div className="devices-list-head">
                <span>{entries.length} songs on the other device</span>
                <button
                  className="primary-button"
                  disabled={!selected.size}
                  onClick={() => {
                    void devices.request(entries.filter((entry) => selected.has(entry.trackId)));
                    setSelected(new Set());
                  }}
                >
                  {selected.size ? `Bring ${selected.size}` : 'Select songs'}
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
          <Link2 size={18} aria-hidden="true" /> Remembered devices
        </h3>
        {!devices.devices.length && (
          <p className="devices-note">
            No device linked yet. Devices you link stay in this list until you remove them.
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
                        ? `${summary.tracks} borrowed · ${kb(summary.bytes)}`
                        : 'nothing borrowed'}
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
                        Remove for good
                      </button>
                      <button className="text-button" onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="icon-button"
                        aria-label={`Link to ${device.name} again`}
                        onClick={devices.invite}
                      >
                        <RotateCcw size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Forget ${device.name}`}
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
        <h3>Borrowed songs</h3>
        <p className="devices-note">
          {kb(devices.usedBytes)} of {kb(devices.capacityBytes)} used. Nothing here is ever removed
          automatically: a song that does not fit is refused, and you decide what to hand back.
        </p>
        {!devices.loans.length && <p className="devices-note">Nothing borrowed.</p>}
        {!!devices.loans.length && (
          <ul className="devices-song-loans">
            {devices.loans.map((loan) => (
              <li key={loan.loanId}>
                <span>
                  <strong>{loan.title ?? 'Borrowed song'}</strong>
                  <small>
                    {loan.artist ?? 'From a linked device'} · {kb(loan.size)}
                  </small>
                </span>
                <button
                  className="text-button"
                  onClick={async () => {
                    const { getLoanedAudio } = await import('../sync/store');
                    const blob = await getLoanedAudio(loan.loanId);
                    if (blob)
                      await onAddLoaned(
                        blob,
                        `${loan.title ?? 'Song'}.${blob.type.split('/')[1] || 'audio'}`,
                      );
                  }}
                >
                  <Check size={15} /> Add to library
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove ${loan.title ?? 'borrowed song'}`}
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
          On the other device, open Wave → Settings → Devices and scan this screen.{' '}
          <ArrowRight size={14} aria-hidden="true" />
        </p>
      )}

      {scanning && <QrScanner onResult={scan} onCancel={() => setScanning(null)} />}
    </div>
  );
}
