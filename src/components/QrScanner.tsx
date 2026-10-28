import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, X } from 'lucide-react';

interface Detector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

/**
 * The reader, inside the app.
 *
 * A camera appears only when the button is pressed, and only for as long as the
 * panel is open: no permission is requested on page load, and the track is
 * stopped the moment the sheet closes or a code is read.
 *
 * Detection uses the browser's own `BarcodeDetector` where it exists, and a
 * small pure-JS decoder otherwise, so the same button works on desktop Chrome,
 * Android and iOS. Each frame is drawn small — a QR reads perfectly at 480 px —
 * which keeps the loop at a few per cent of one core.
 */
export function QrScanner({
  onResult,
  onCancel,
}: {
  onResult: (value: string) => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let detector: Detector | null = null;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const scan = async () => {
      if (stopped) return;
      const element = video.current;
      if (element && element.readyState >= 2 && context) {
        const width = 480;
        const height = Math.round((element.videoHeight / element.videoWidth) * width) || 480;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        context.drawImage(element, 0, 0, width, height);
        let value: string | null = null;
        if (detector) {
          try {
            const codes = await detector.detect(canvas);
            value = codes[0]?.rawValue ?? null;
          } catch {
            value = null;
          }
        }
        if (!value) {
          const image = context.getImageData(0, 0, width, height);
          value =
            jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null;
        }
        if (value) {
          stopped = true;
          onResult(value);
          return;
        }
      }
      frame = requestAnimationFrame(() => void scan());
    };

    void (async () => {
      try {
        const Ctor = (
          window as unknown as {
            BarcodeDetector?: new (options: { formats: string[] }) => Detector;
          }
        ).BarcodeDetector;
        if (Ctor) {
          try {
            detector = new Ctor({ formats: ['qr_code'] });
          } catch {
            detector = null;
          }
        }
      } catch {
        detector = null;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => undefined);
          setReady(true);
        }
        // Frames start only once the picture is actually there.
        frame = requestAnimationFrame(() => void scan());
      } catch {
        setError(
          'The camera could not be opened. Allow camera access for this site, or open the link on the other device instead.',
        );
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [onResult]);

  return (
    <div className="qr-scanner" role="dialog" aria-label="Scan a Wave code">
      <div className="qr-scanner-frame">
        <video ref={video} playsInline muted aria-label="Camera" />
        {!ready && !error && <p className="qr-scanner-hint">Starting the camera…</p>}
        <span className="qr-scanner-corners" aria-hidden="true" />
      </div>
      {error ? (
        <p className="qr-scanner-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="qr-scanner-hint">
          <Camera size={16} aria-hidden="true" /> Point at the code on the other device.
        </p>
      )}
      <button className="tonal-button" onClick={onCancel}>
        <X size={16} /> Close
      </button>
    </div>
  );
}
