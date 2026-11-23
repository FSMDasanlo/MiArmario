import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';

export function BarcodeScanner({ onScan }: { onScan: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState('');
  onScanRef.current = onScan;

  useEffect(() => {
    let active = true;
    let controls: IScannerControls | undefined;
    const reader = new BrowserMultiFormatReader();
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !video.current) throw new Error('camera unavailable');
        const scanner = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          video.current,
          (result, _error, scannerControls) => {
            if (active && result) {
              active = false;
              scannerControls.stop();
              onScanRef.current(result.getText());
            }
          },
        );
        controls = scanner;
        if (!active) scanner.stop();
      } catch {
        if (active) setError('No se pudo abrir la cámara. Comprueba los permisos o escribe el código manualmente.');
      }
    }
    void start();
    return () => { active = false; controls?.stop(); };
  }, []);

  return <div className="barcode-camera">
    <video ref={video} muted playsInline aria-label="Vista de la cámara para escanear el código" />
    {error ? <p role="alert">{error}</p> : <p>Enfoca el código de barras o QR.</p>}
  </div>;
}
