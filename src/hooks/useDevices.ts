import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceLink, type LinkStatus, type PeerLibrary } from '../sync/link';
import { createTransport, type Transport } from '../sync/transport';
import { decodeSignal } from '../sync/signal';
import {
  forgetDevice,
  getDevices,
  getLoans,
  getSyncUsage,
  deleteDeviceLoans,
  deleteLoan,
} from '../sync/store';
import type { LoanRecord } from '../sync/loan';
import type { DeviceSummary } from '../sync/loan';
import type { LibraryEntry } from '../sync/protocol';
import type { SyncDevice } from '../sync/store';
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
function defaultName() {
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

export const LINK_STEPS = ['invite', 'join', 'confirm', 'browse'] as const;
export type LinkStep = (typeof LINK_STEPS)[number];

/**
 * Linking two devices, from the interface's point of view.
 *
 * The page gives a track list and gets back a paired peer, its library, and the
 * loans that arrived. Everything cryptographic stays in `src/sync`; this file
 * only sequences it and keeps the results in state.
 */
export function useDevices(tracks: Track[]) {
  const tracksRef = useRef(tracks);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  const [status, setStatus] = useState<LinkStatus>({ kind: 'idle' });
  const [step, setStep] = useState<LinkStep>('invite');
  /** The code this device should show, if it is the host. */
  const [showCode, setShowCode] = useState('');
  /** The code this device should send back, if it is the guest. */
  const [replyCode, setReplyCode] = useState('');
  const [peerLibrary, setPeerLibrary] = useState<PeerLibrary | null>(null);
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [summaries, setSummaries] = useState<DeviceSummary[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);
  const [capacityBytes, setCapacityBytes] = useState(0);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const link = useRef<DeviceLink | null>(null);
  const transport = useRef<Transport | null>(null);

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
      // Private mode or a wiped database: the page simply shows nothing saved.
    }
  }, []);

  useEffect(() => {
    // Reading the sync database is an external read, not a render input; the
    // results arrive in the callback below.
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
        // Private mode or a wiped database: nothing saved is a fine answer.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const reset = useCallback(() => {
    link.current?.close();
    transport.current?.close();
    link.current = null;
    transport.current = null;
    setStatus({ kind: 'idle' });
    setStep('invite');
    setShowCode('');
    setReplyCode('');
    setPeerLibrary(null);
    setProgress(null);
  }, []);

  useEffect(() => () => reset(), [reset]);

  const makeLink = useCallback(
    async (polite: boolean) => {
      if (typeof RTCPeerConnection === 'undefined')
        throw new Error('This browser cannot link devices. Try Chrome, Edge or Safari.');
      const device = await DeviceLink.create({
        tracks: () =>
          tracksRef.current.map((track) => ({
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            size: track.blob?.size ?? 0,
            blob: track.blob ?? new Blob(),
          })),
        name: defaultName(),
        deviceId: deviceId(),
        onStatus: setStatus,
        onLibrary: setPeerLibrary,
        onProgress: (value) =>
          setProgress(value ? { received: value.received, total: value.total } : null),
        onLoaned: () => void refresh(),
        onError: setError,
      });
      const wire = createTransport(
        { polite },
        { onMessage: () => undefined, onState: () => undefined },
      );
      link.current = device;
      transport.current = wire;
      return { device, wire };
    },
    [refresh],
  );

  /** Host: make a code and wait for the guest's reply. */
  const startInvite = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      reset();
      const { device, wire } = await makeLink(false);
      const code = await device.invite(wire);
      setShowCode(code);
      setStep('invite');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The code could not be created.');
    } finally {
      setBusy(false);
    }
  }, [makeLink, reset]);

  /** Guest: paste the host's code, and get the reply to send back. */
  const joinWithCode = useCallback(
    async (hostCode: string) => {
      setError('');
      setBusy(true);
      try {
        await decodeSignal(hostCode);
        reset();
        const { device, wire } = await makeLink(true);
        const reply = await device.join(wire, hostCode);
        setReplyCode(reply ?? '');
        setStep('join');
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'That code could not be read. Copy it again, whole.',
        );
      } finally {
        setBusy(false);
      }
    },
    [makeLink, reset],
  );

  /** Host: paste the guest's reply to complete the connection. */
  const acceptReply = useCallback(async (code: string) => {
    setError('');
    setBusy(true);
    try {
      await transport.current?.acceptCode(code);
      setStep('confirm');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That reply could not be read.');
    } finally {
      setBusy(false);
    }
  }, []);

  const confirm = useCallback(() => {
    link.current?.confirm();
    setStep('browse');
  }, []);

  const request = useCallback(async (entries: LibraryEntry[]) => {
    setError('');
    try {
      const count = await link.current?.request(entries);
      if (count) setProgress({ received: 0, total: 0 });
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
    step,
    setStep,
    showCode,
    replyCode,
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
    startInvite,
    joinWithCode,
    acceptReply,
    confirm,
    request,
    removeLoan,
    removeDevice,
    reset,
    refresh,
  };
}
