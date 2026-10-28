import { useMemo, useState } from 'react';
import { ArrowRight, Copy, Link2, Loader2, Trash2, Unplug } from 'lucide-react';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { useDevices } from '../hooks/useDevices';
import type { Track } from '../domain/types';

const kb = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const failureText = (reason: string) =>
  ({
    timeout: 'The code expired before the other device answered. Make a new one.',
    rejected: 'The other device declined.',
    'unsupported-version': 'That device runs a different version of Wave.',
    self: 'That is this device. Use the other one to join.',
    authentication: 'The two devices did not agree on the same key. Start again.',
    replay: 'A message arrived twice and was refused. Start again.',
    protocol: 'The two devices are not speaking the same protocol.',
    transport: 'The connection closed. Start again — nothing was changed.',
  })[reason] ?? 'The link failed. Nothing was changed.';

/**
 * Devices.
 *
 * Pairing here is deliberately manual: Wave has no account and no server, so the
 * two devices exchange one code each. That is the honest version of "link your
 * phone", and it is also the one that works on a home network without asking
 * anyone's permission. Once linked, the other device's library is browsable and a
 * song can be borrowed: copied, checked byte for byte, and stored on this side.
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
  const [hostCode, setHostCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [replyInput, setReplyInput] = useState('');
  const [copied, setCopied] = useState<'host' | 'join' | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const entries = useMemo(() => devices.peerLibrary?.entries ?? [], [devices.peerLibrary]);

  const copy = async (value: string, which: 'host' | 'join') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="devices-page">
      <p className="devices-intro">
        Link two devices to listen to the other one's songs. Nothing is uploaded: the two browsers
        talk to each other directly, and only the songs you pick are copied.
      </p>

      {devices.confirmCode && (
        <motion.div
          className="devices-card devices-confirm"
          initial={{ opacity: animation.enabled ? 0 : 1, y: animation.enabled ? 8 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={animation.effects}
        >
          <strong>Check both screens</strong>
          <p>
            Both devices must show the same six digits. If they differ, close this page and start
            again.
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
        </motion.div>
      )}

      {!devices.connected && !devices.confirmCode && (
        <div className="devices-grid">
          <section className="devices-card">
            <h3>
              <Link2 size={18} aria-hidden="true" /> This device
            </h3>
            <p>
              Make a code here, then paste it into the other device. If it asks anything, send its
              reply back in this box.
            </p>
            <div className="devices-actions">
              <button
                className="primary-button"
                disabled={devices.busy}
                onClick={async () => {
                  await devices.startInvite();
                  setHostCode('');
                }}
              >
                {devices.busy ? <Loader2 size={16} className="spin" /> : null}
                Make a code
              </button>
            </div>
            {devices.showCode && (
              <>
                <label className="devices-field">
                  <span>Send this to the other device</span>
                  <textarea readOnly value={devices.showCode} rows={4} />
                </label>
                <div className="devices-actions">
                  <button
                    className="text-button"
                    onClick={() => void copy(devices.showCode, 'host')}
                  >
                    <Copy size={16} /> {copied === 'host' ? 'Copied' : 'Copy code'}
                  </button>
                </div>
                <label className="devices-field">
                  <span>Paste the reply it gives you</span>
                  <textarea
                    rows={3}
                    value={hostCode || replyInput}
                    onChange={(event) => setReplyInput(event.target.value)}
                    placeholder="wave1.…"
                  />
                </label>
                <div className="devices-actions">
                  <button
                    className="primary-button"
                    disabled={!replyInput.trim() || devices.busy}
                    onClick={() => void devices.acceptReply(replyInput.trim())}
                  >
                    Connect <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="devices-card">
            <h3>
              <Unplug size={18} aria-hidden="true" /> Another device
            </h3>
            <p>Got a code from the other device? Paste it here and give its reply back.</p>
            <label className="devices-field">
              <span>The code it showed you</span>
              <textarea
                rows={3}
                value={joinInput}
                onChange={(event) => setJoinInput(event.target.value)}
                placeholder="wave1.…"
              />
            </label>
            <div className="devices-actions">
              <button
                className="primary-button"
                disabled={!joinInput.trim() || devices.busy}
                onClick={() => void devices.joinWithCode(joinInput.trim())}
              >
                Join
              </button>
            </div>
            {devices.replyCode && (
              <>
                <label className="devices-field">
                  <span>Give this reply back to the other device</span>
                  <textarea readOnly value={devices.replyCode} rows={4} />
                </label>
                <div className="devices-actions">
                  <button
                    className="text-button"
                    onClick={() => void copy(devices.replyCode, 'join')}
                  >
                    <Copy size={16} /> {copied === 'join' ? 'Copied' : 'Copy reply'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
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
          {devices.progress && (
            <p className="devices-note" role="status">
              {devices.progress.total > 0
                ? `Receiving ${devices.progress.received} of ${devices.progress.total} chunks…`
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
        <h3>Remembered devices</h3>
        {!devices.devices.length && (
          <p className="devices-note">
            No device linked yet. A link lasts while both windows are open.
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
                  <button
                    className="icon-button"
                    aria-label={`Forget ${device.name}`}
                    onClick={() => void devices.removeDevice(device.deviceId)}
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="devices-card">
        <h3>Borrowed songs</h3>
        <p className="devices-note">
          {kb(devices.usedBytes)} of {kb(devices.capacityBytes)} used. Borrowed audio can be removed
          at any time; nothing is deleted from the other device.
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
                        `${loan.title ?? 'Song'}.${loan.title ? 'mp3' : 'bin'}`,
                      );
                  }}
                >
                  Add to library
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove ${loan.title ?? 'borrowed song'}`}
                  onClick={() => void devices.removeLoan(loan.loanId)}
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
