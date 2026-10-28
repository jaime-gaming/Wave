import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { DeviceLink, type LinkStatus, type PeerLibrary } from '../sync/link';
import { createTransport, type Transport } from '../sync/transport';
import { decodeSignal } from '../sync/signal';
import { loadIdentity } from '../sync/identity';
import {
  deleteDeviceLoans,
  deleteLoan,
  forgetDevice,
  getDevices,
  getLoans,
  getSyncUsage,
  type SyncDevice,
} from '../sync/store';
import type { DeviceSummary, LoanRecord } from '../sync/loan';
import type { LibraryEntry } from '../sync/protocol';
import type { Track } from '../domain/types';

const DEVICE_ID_KEY = 'wave-device-id';
const DEVICE_NAME_KEY = 'wave-device-name';

function urlSafeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function deviceId() {
  try {
    const saved = localStorage.getItem(DEVICE_ID_KEY);
    if (saved && /^[A-Za-z0-9_-]{8,72}$/u.test(saved)) return saved;
    const created = urlSafeId();
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return urlSafeId();
  }
}

/** A name that says which device this is, without asking. */
export function defaultDeviceName() {
  try {
    const saved = localStorage.getItem(DEVICE_NAME_KEY);
    if (saved) return saved;
  } catch {
    // Storage is unavailable; a name is still needed for this session.
  }
  const platform = /Android/u.test(navigator.userAgent) ? 'Android' : 'Wave';
  return `${platform} · ${location.hostname || 'browser'}`.slice(0, 64);
}

export function setDeviceName(name: string) {
  try {
    localStorage.setItem(DEVICE_NAME_KEY, name.trim().slice(0, 64));
  } catch {
    // Session only.
  }
}

/** The link a QR code carries. Opening it on the other device is enough. */
export function pairingLink(payload: string) {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#wave-pair=${encodeURIComponent(payload)}`;
}

/** Reads a pairing payload from a scanned or opened link. */
export function readPairingLink(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  const match = /(?:^|[#&?])wave-pair=([^&\s]+)/u.exec(value);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  return value.startsWith('wave1.') ? value : null;
}

/** What the page is doing, in one word each. */
export type LinkStage =
  'idle' | 'show-code' | 'scan-reply' | 'scan-invite' | 'show-reply' | 'confirm' | 'connected';

export function useDevices(tracks: Track[]) {
  const tracksRef = useRef(tracks);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const [status, setStatus] = useState<LinkStatus>({ kind: 'idle' });
  const [stage, setStage] = useState<LinkStage>('idle');
  const [qr, setQr] = useState('');
  const [link, setLink] = useState('');
  const [peerLibrary, setPeerLibrary] = useState<PeerLibrary | null>(null);
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [summaries, setSummaries] = useState<DeviceSummary[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);
  const [capacityBytes, setCapacityBytes] = useState(0);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const linkRef = useRef<DeviceLink | null>(null);
  const transportRef = useRef<Transport | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [saved, borrowed, usage] = await Promise.all([
        getDevices(),
        getLoans(),
        getSyncUsage(),
      ]);
      setDevices(saved);
      setLoans(borrowed);
      setSummaries(usage.devices);
      setUsedBytes(usage.usage.bytes);
      setCapacityBytes(usage.usage.capacityBytes);
    } catch {
      // Private mode or a wiped database: nothing saved is a fine answer.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [saved, borrowed, usage] = await Promise.all([
          getDevices(),
          getLoans(),
          getSyncUsage(),
        ]);
        if (!active) return;
        setDevices(saved);
        setLoans(borrowed);
        setSummaries(usage.devices);
        setUsedBytes(usage.usage.bytes);
        setCapacityBytes(usage.usage.capacityBytes);
      } catch {
        // Nothing stored yet.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const reset = useCallback(() => {
    linkRef.current?.close();
    transportRef.current?.close();
    linkRef.current = null;
    transportRef.current = null;
    setStatus({ kind: 'idle' });
    setStage('idle');
    setQr('');
    setLink('');
    setPeerLibrary(null);
    setProgress(null);
  }, []);

  useEffect(() => () => reset(), [reset]);

  const makeLink = useCallback(
    async (polite: boolean) => {
      if (typeof RTCPeerConnection === 'undefined')
        throw new Error('This browser cannot link devices. Try Chrome, Edge or Safari.');
      const identity = await loadIdentity(deviceId(), defaultDeviceName());
      const device = DeviceLink.create(
        {
          tracks: () =>
            tracksRef.current.map((track) => ({
              id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album,
              size: track.blob?.size ?? 0,
              blob: track.blob ?? new Blob(),
            })),
          name: defaultDeviceName(),
          deviceId: identity.deviceId,
          onStatus: (next) => {
            setStatus(next);
            if (next.kind === 'connected') setStage('connected');
            if (next.kind === 'confirm') setStage('confirm');
          },
          onLibrary: setPeerLibrary,
          onProgress: (value) =>
            setProgress(value ? { received: value.received, total: value.total } : null),
          onLoaned: () => void refresh(),
          onError: setError,
        },
        identity,
      );
      const wire = createTransport(
        { polite },
        { onMessage: () => undefined, onState: () => undefined },
      );
      linkRef.current = device;
      transportRef.current = wire;
      return { device, wire };
    },
    [refresh],
  );

  const show = useCallback(async (payload: string) => {
    const value = pairingLink(payload);
    setLink(value);
    setQr(
      await QRCode.toDataURL(value, {
        errorCorrectionLevel: 'L',
        margin: 1,
        width: 360,
        color: { dark: '#0b0e15', light: '#ffffff' },
      }),
    );
  }, []);

  /** Host: creates the invite and shows it as a QR code. */
  const invite = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      reset();
      const { device, wire } = await makeLink(false);
      await show(await device.invite(wire));
      setStage('show-code');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The code could not be created.');
    } finally {
      setBusy(false);
    }
  }, [makeLink, reset, show]);

  /** Host: applies the reply the other device showed. */
  const acceptReply = useCallback(async (raw: string) => {
    setError('');
    setBusy(true);
    try {
      const payload = readPairingLink(raw);
      if (!payload) throw new Error('That does not look like a Wave code.');
      await decodeSignal(payload);
      await transportRef.current?.acceptCode(payload);
      setStage('confirm');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That code could not be read.');
    } finally {
      setBusy(false);
    }
  }, []);

  /** Guest: joins from a scanned or opened invite, then shows a reply QR. */
  const join = useCallback(
    async (raw: string) => {
      setError('');
      setBusy(true);
      try {
        const payload = readPairingLink(raw);
        if (!payload) throw new Error('That does not look like a Wave code.');
        await decodeSignal(payload);
        reset();
        const { device, wire } = await makeLink(true);
        const reply = await device.join(wire, payload);
        if (reply) {
          await show(reply);
          setStage('show-reply');
        }
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : 'That code could not be read. Try again.',
        );
      } finally {
        setBusy(false);
      }
    },
    [makeLink, reset, show],
  );

  const confirm = useCallback(() => {
    linkRef.current?.confirm();
    setStage('connected');
  }, []);

  const request = useCallback(async (entries: LibraryEntry[]) => {
    setError('');
    try {
      await linkRef.current?.request(entries);
      setProgress({ received: 0, total: 0 });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The songs could not be requested.');
    }
  }, []);

  const removeLoan = useCallback(
    async (loanId: string) => {
      await deleteLoan(loanId);
      await refresh();
    },
    [refresh],
  );

  /** Removing a device is explicit, and takes its borrowed songs with it. */
  const removeDevice = useCallback(
    async (id: string) => {
      await deleteDeviceLoans(id);
      await forgetDevice(id);
      await refresh();
    },
    [refresh],
  );

  return {
    status,
    stage,
    qr,
    link,
    peerLibrary,
    devices,
    loans,
    summaries,
    usedBytes,
    capacityBytes,
    progress,
    error,
    busy,
    connected: status.kind === 'connected',
    confirmCode: status.kind === 'confirm' ? status.code : '',
    peerName: status.kind === 'confirm' || status.kind === 'connected' ? status.peerName : '',
    invite,
    join,
    acceptReply,
    confirm,
    request,
    removeLoan,
    removeDevice,
    reset,
    refresh,
  };
}
