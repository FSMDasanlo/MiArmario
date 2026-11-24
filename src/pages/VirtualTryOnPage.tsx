import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Download, Maximize2, Sparkles, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Notice, PageHeading } from '../components/AppShell';
import { VirtualTryOnUsage } from '../components/VirtualTryOnUsage';
import { listGarments } from '../services/garments';
import { deleteVirtualImage, generateVirtualImage, readVirtualImage, saveVirtualPhoto } from '../services/virtualTryOn';
import type { Garment } from '../types';

function useBlobUrl(blob: Blob | null): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function VirtualTryOnPage() {
  const { user } = useAuth();
  const [garments, setGarments] = useState<Garment[]>([]);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const [garmentId, setGarmentId] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const resultDialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [showUsage, setShowUsage] = useState(false);
  const photoUrl = useBlobUrl(photo);
  const resultUrl = useBlobUrl(result);
  const selected = garments.find((garment) => garment.id === garmentId);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([listGarments(user.uid), readVirtualImage(user.uid, 'photo'), readVirtualImage(user.uid, 'result')])
      .then(([items, personalPhoto, previousResult]) => {
        if (!active) return;
        setGarments(items.filter((item) => item.imagePath && item.imageUrl));
        setPhoto(personalPhoto);
        setResult(previousResult);
      })
      .catch(() => { if (active) setError('No se pudo cargar el vestuario virtual. Comprueba tu conexión e inténtalo de nuevo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  async function run(label: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError('');
    try {
      await action();
    } catch (caught) {
      setError(message(caught, 'No se pudo completar la operación.'));
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user) return;
    void run('Guardando fotografía…', async () => {
      await saveVirtualPhoto(user.uid, file);
      setPhoto(file);
      setConsent(false);
    });
  }

  function removeImage(name: 'photo' | 'result') {
    if (!user || !window.confirm(name === 'photo' ? '¿Eliminar tu fotografía personal?' : '¿Eliminar la simulación guardada?')) return;
    void run('Eliminando…', async () => {
      await deleteVirtualImage(user.uid, name);
      if (name === 'photo') {
        setPhoto(null);
        setConsent(false);
      } else {
        setResult(null);
      }
    });
  }

  function generate() {
    if (!user || !photo || !selected || !consent || busyRef.current) return;
    void run('Generando simulación…', async () => {
      setConsent(false);
      await generateVirtualImage(user.uid, selected.id);
      setResult(null);
      let generated: Blob | null;
      try {
        generated = await readVirtualImage(user.uid, 'result');
      } catch {
        throw new Error('La simulación se guardó, pero no se pudo recuperar. Recarga la página antes de volver a intentarlo.');
      }
      if (!generated) throw new Error('La simulación se guardó, pero no se pudo recuperar. Recarga la página antes de volver a intentarlo.');
      setResult(generated);
    });
  }

  return (
    <div className="virtual-page">
      <PageHeading title="Vestuario Virtual" description="Descubre cómo podría quedarte una prenda de tu armario." />
      {error && <Notice>{error}</Notice>}
      {loading ? <div className="loading-panel">Preparando tu vestuario virtual…</div> : !user ? (
        <Notice tone="info">Inicia sesión y configura Firebase para utilizar el vestuario virtual.</Notice>
      ) : (
        <>
          {user.email === 'jesus.samperruiz@gmail.com' && user.emailVerified && (
            <>
              <button className="button-secondary virtual-usage-toggle" aria-expanded={showUsage} onClick={() => setShowUsage((open) => !open)}>
                {showUsage ? 'Cerrar control de pruebas' : 'Control de pruebas'}
              </button>
              {showUsage && <VirtualTryOnUsage userId={user.uid} />}
            </>
          )}
          <div className="virtual-grid">
            <section className="virtual-card">
              <h2>1. Tu fotografía</h2>
              <p>Elige una foto de cuerpo entero en JPG, PNG o WebP, de hasta 5 MB.</p>
              {photoUrl && <img className="virtual-preview" src={photoUrl} alt="Tu fotografía personal" />}
              <div className="virtual-actions">
                <label className={`button-secondary virtual-upload ${busy ? 'virtual-disabled' : ''}`}>
                  {photo ? 'Sustituir fotografía' : 'Elegir fotografía'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={choosePhoto} />
                </label>
                {photo && <button className="button-secondary" disabled={Boolean(busy)} onClick={() => removeImage('photo')}><Trash2 size={16} /> Eliminar</button>}
              </div>
            </section>
            <section className="virtual-card">
              <h2>2. Tu prenda</h2>
              {garments.length ? (
                <>
                  <label className="virtual-select">Selecciona una prenda
                    <select value={garmentId} disabled={Boolean(busy)} onChange={(event) => { setGarmentId(event.target.value); setConsent(false); }}>
                      <option value="">Elige una prenda</option>
                      {garments.map((garment) => <option key={garment.id} value={garment.id}>{garment.name} — {garment.color}</option>)}
                    </select>
                  </label>
                  {selected?.imageUrl && <img className="virtual-preview" src={selected.imageUrl} alt={`Fotografía de ${selected.name}`} />}
                </>
              ) : <p>Añade una prenda con fotografía en <Link to="/armario">Mi armario</Link>.</p>}
            </section>
          </div>
          <section className="virtual-card virtual-consent">
            <h2>3. Tu simulación</h2>
            <p>Para generar esta simulación, MiArmario enviará tu fotografía personal y la fotografía de la prenda a Google Vertex AI. El modelo utilizado procesa las imágenes mediante un endpoint global, por lo que no se garantiza que el procesamiento se realice en España o dentro de la Unión Europea. La imagen generada es orientativa y no garantiza la talla ni el ajuste real.</p>
            <p>Cada intento puede generar costes. Una nueva simulación sustituirá el resultado guardado anterior.</p>
            <label className="virtual-checkbox"><input type="checkbox" checked={consent} disabled={Boolean(busy)} onChange={(event) => setConsent(event.target.checked)} /> Acepto el envío de ambas fotografías a Google Vertex AI para esta simulación.</label>
            <button className="button-primary" disabled={Boolean(busy) || !photo || !selected || !consent} onClick={generate}>
              {busy === 'Generando simulación…' ? <span className="button-spinner" /> : <Sparkles size={17} />}
              {busy || 'Probar cómo me queda'}
            </button>
          </section>
          {resultUrl && (
            <section className="virtual-card virtual-result" aria-live="polite">
              <h2>Simulación orientativa generada por IA</h2>
              <img className="virtual-preview" src={resultUrl} alt="Simulación orientativa generada por IA" />
              <div className="virtual-actions">
                <button className="button-secondary" onClick={() => resultDialogRef.current?.showModal()}><Maximize2 size={16} /> Ampliar</button>
                <a className="button-secondary" href={resultUrl} download={`simulacion.${result?.type === 'image/jpeg' ? 'jpg' : result?.type === 'image/webp' ? 'webp' : 'png'}`}><Download size={16} /> Descargar</a>
                <button className="button-secondary" disabled={Boolean(busy)} onClick={() => removeImage('result')}><Trash2 size={16} /> Eliminar</button>
              </div>
              <dialog ref={resultDialogRef} className="modal-panel virtual-image-dialog" aria-labelledby="virtual-image-title">
                <div className="modal-header">
                  <h2 id="virtual-image-title">Simulación ampliada</h2>
                  <button className="icon-button" onClick={() => resultDialogRef.current?.close()} aria-label="Cerrar"><X size={20} /></button>
                </div>
                <img src={resultUrl} alt="Simulación orientativa generada por IA" />
              </dialog>
            </section>
          )}
        </>
      )}
    </div>
  );
}
