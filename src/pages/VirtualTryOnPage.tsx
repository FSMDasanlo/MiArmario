import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Check, Download, Maximize2, Plus, Shirt, Sparkles, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import mannequinManUrl from '../../img/maniqui_hombre.jpeg';
import mannequinWomanUrl from '../../img/maniqui_mujer.jpeg';
import { useAuth } from '../auth/AuthProvider';
import { Notice, PageHeading } from '../components/AppShell';
import { VirtualTryOnUsage } from '../components/VirtualTryOnUsage';
import { listGarments } from '../services/garments';
import { deleteVirtualImage, generateCustomVirtualImage, generateVirtualImage, readVirtualImage, saveVirtualPhoto, saveVirtualReference, type CustomTryOnMode, type VirtualReference } from '../services/virtualTryOn';
import type { Garment } from '../types';

type ModelChoice = Exclude<CustomTryOnMode, 'body' | 'mannequin'> | 'mannequin-man' | 'mannequin-woman';

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
  const [face, setFace] = useState<Blob | null>(null);
  const [mannequin, setMannequin] = useState<Blob | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const [garmentId, setGarmentId] = useState('');
  const [additionalGarmentIds, setAdditionalGarmentIds] = useState<string[]>([]);
  const [garmentIds, setGarmentIds] = useState<string[]>([]);
  const [section, setSection] = useState<'photo' | 'custom'>('photo');
  const [customMode, setCustomMode] = useState<ModelChoice>('face');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const resultDialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [showUsage, setShowUsage] = useState(false);
  const photoUrl = useBlobUrl(photo);
  const faceUrl = useBlobUrl(face);
  const mannequinUrl = useBlobUrl(mannequin);
  const resultUrl = useBlobUrl(result);
  const selected = garments.find((garment) => garment.id === garmentId);
  const photoGarmentIds = [garmentId, ...additionalGarmentIds].filter(Boolean);
  const needsFace = customMode === 'face' || customMode === 'mannequin-face';
  const needsMannequin = customMode === 'mannequin-face';
  const defaultMannequinUrl = customMode === 'mannequin-man' ? mannequinManUrl
    : customMode === 'mannequin-woman' ? mannequinWomanUrl : undefined;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      listGarments(user.uid),
      readVirtualImage(user.uid, 'photo'),
      readVirtualImage(user.uid, 'face'),
      readVirtualImage(user.uid, 'mannequin'),
      readVirtualImage(user.uid, 'result'),
    ])
      .then(([items, personalPhoto, facePhoto, mannequinPhoto, previousResult]) => {
        if (!active) return;
        setGarments(items.filter((item) => item.imagePath && item.imageUrl));
        setPhoto(personalPhoto);
        setFace(facePhoto);
        setMannequin(mannequinPhoto);
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

  function chooseReference(kind: 'face' | 'mannequin', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user) return;
    void run('Guardando fotografía…', async () => {
      await saveVirtualReference(user.uid, kind, file);
      if (kind === 'face') setFace(file);
      else setMannequin(file);
      setConsent(false);
    });
  }

  function removeImage(name: VirtualReference) {
    const labels: Record<VirtualReference, string> = {
      photo: 'tu fotografía personal',
      face: 'tu fotografía de cara',
      mannequin: 'la fotografía del maniquí',
      result: 'la simulación guardada',
    };
    if (!user || !window.confirm(`¿Eliminar ${labels[name]}?`)) return;
    void run('Eliminando…', async () => {
      await deleteVirtualImage(user.uid, name);
      if (name === 'photo') {
        setPhoto(null);
        setConsent(false);
      } else if (name === 'face') {
        setFace(null);
        setConsent(false);
      } else if (name === 'mannequin') {
        setMannequin(null);
        setConsent(false);
      } else {
        setResult(null);
      }
    });
  }

  function generate() {
    const [firstGarmentId] = photoGarmentIds;
    if (!user || !photo || !garmentId || !firstGarmentId || additionalGarmentIds.some((id) => !id) || !consent || busyRef.current) return;
    void run('Generando simulación…', async () => {
      setConsent(false);
      if (photoGarmentIds.length === 1) {
        await generateVirtualImage(user.uid, firstGarmentId);
      } else {
        await generateCustomVirtualImage(user.uid, 'body', photoGarmentIds);
      }
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

  function generateCustom() {
    if (!user || !garmentIds.length || (needsFace && !face) || (needsMannequin && !mannequin) || !consent || busyRef.current) return;
    void run('Generando simulación…', async () => {
      setConsent(false);
      const mode = customMode === 'mannequin-man' || customMode === 'mannequin-woman' ? 'mannequin' : customMode;
      await generateCustomVirtualImage(user.uid, mode, garmentIds, defaultMannequinUrl);
      setResult(null);
      const generated = await readVirtualImage(user.uid, 'result');
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
          <div className="virtual-tabs" aria-label="Modalidad de vestuario virtual">
            <button type="button" aria-pressed={section === 'photo'} className={section === 'photo' ? 'virtual-tab virtual-tab-active' : 'virtual-tab'} onClick={() => { setSection('photo'); setConsent(false); }}>Mi fotografía</button>
            <button type="button" aria-pressed={section === 'custom'} className={section === 'custom' ? 'virtual-tab virtual-tab-active' : 'virtual-tab'} onClick={() => { setSection('custom'); setConsent(false); }}>Probador personalizado</button>
          </div>
          {section === 'photo' ? (
            <>
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
                      {garments.filter((garment) => !additionalGarmentIds.includes(garment.id) || garment.id === garmentId).map((garment) => <option key={garment.id} value={garment.id}>{garment.name} — {garment.color}</option>)}
                    </select>
                  </label>
                  {selected?.imageUrl && <img className="virtual-preview" src={selected.imageUrl} alt={`Fotografía de ${selected.name}`} />}
                  {additionalGarmentIds.map((id, index) => {
                    const selectedIds = photoGarmentIds.filter((selectedId) => selectedId !== id);
                    return <div className="virtual-extra-garment" key={`extra-${index}`}>
                      <label className="virtual-select">Otra prenda
                        <select value={id} disabled={Boolean(busy)} onChange={(event) => { setAdditionalGarmentIds((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item)); setConsent(false); }}>
                          <option value="">Elige una prenda</option>
                          {garments.filter((garment) => !selectedIds.includes(garment.id)).map((garment) => <option key={garment.id} value={garment.id}>{garment.name} — {garment.color}</option>)}
                        </select>
                      </label>
                      <button type="button" className="button-secondary" disabled={Boolean(busy)} aria-label="Quitar prenda" onClick={() => { setAdditionalGarmentIds((items) => items.filter((_, itemIndex) => itemIndex !== index)); setConsent(false); }}><X size={16} /></button>
                    </div>;
                  })}
                  {garmentId && photoGarmentIds.length < 6 && additionalGarmentIds.every(Boolean) && <button type="button" className="button-secondary virtual-add-garment" disabled={Boolean(busy)} onClick={() => { setAdditionalGarmentIds((items) => [...items, '']); setConsent(false); }}><Plus size={16} /> Añadir otra prenda</button>}
                </>
              ) : <p>Añade una prenda con fotografía en <Link to="/armario">Mi armario</Link>.</p>}
            </section>
          </div>
          <section className="virtual-card virtual-consent">
            <h2>3. Tu simulación</h2>
            <p>Para generar esta simulación, MiArmario enviará tu fotografía personal y las prendas seleccionadas a Google Vertex AI. El modelo utilizado procesa las imágenes mediante un endpoint global, por lo que no se garantiza que el procesamiento se realice en España o dentro de la Unión Europea. La imagen generada es orientativa y no garantiza la talla ni el ajuste real.</p>
            <p>Cada intento puede generar costes. Una nueva simulación sustituirá el resultado guardado anterior.</p>
            <label className="virtual-checkbox"><input type="checkbox" checked={consent} disabled={Boolean(busy)} onChange={(event) => setConsent(event.target.checked)} /> Acepto el envío de mi fotografía y las prendas seleccionadas a Google Vertex AI para esta simulación.</label>
            <button className="button-primary" disabled={Boolean(busy) || !photo || !garmentId || !photoGarmentIds.length || additionalGarmentIds.some((id) => !id) || !consent} onClick={generate}>
              {busy === 'Generando simulación…' ? <span className="button-spinner" /> : <Sparkles size={17} />}
              {busy || 'Probar cómo me queda'}
            </button>
          </section>
            </>
          ) : (
            <>
              <section className="virtual-card">
                <h2>Elige tu modelo</h2>
                <p>Selecciona las fotografías de referencia que quieras combinar con las prendas de tu armario.</p>
                <label className="virtual-select">Tipo de modelo
                  <select value={customMode} disabled={Boolean(busy)} onChange={(event) => {
                    const nextMode = event.target.value;
                    if (nextMode === 'face' || nextMode === 'mannequin-man' || nextMode === 'mannequin-woman' || nextMode === 'mannequin-face' || nextMode === 'generated') setCustomMode(nextMode);
                    setConsent(false);
                  }}>
                    <option value="face">Mi cara</option>
                    <option value="mannequin-man">Maniquí hombre</option>
                    <option value="mannequin-woman">Maniquí mujer</option>
                    <option value="mannequin-face">Maniquí + mi cara</option>
                    <option value="generated">Modelo generado (sin foto)</option>
                  </select>
                </label>
              </section>
              {defaultMannequinUrl && (
                <section className="virtual-card">
                  <h2>{customMode === 'mannequin-man' ? 'Maniquí hombre' : 'Maniquí mujer'}</h2>
                  <img className="virtual-preview" src={defaultMannequinUrl} alt={customMode === 'mannequin-man' ? 'Maniquí hombre seleccionado' : 'Maniquí mujer seleccionado'} />
                </section>
              )}
              {(needsFace || needsMannequin) && (
                <div className="virtual-grid">
                  {needsFace && <section className="virtual-card">
                    <h2>Fotografía de tu cara</h2>
                    <p>JPG, PNG o WebP, hasta 5 MB. Usa una foto nítida, con buena luz y el rostro visible, sin filtros. Se guarda de forma privada en Firebase Storage y puedes eliminarla cuando quieras.</p>
                    {faceUrl && <img className="virtual-preview" src={faceUrl} alt="Referencia de tu cara" />}
                    <div className="virtual-actions">
                      <label className={`button-secondary virtual-upload ${busy ? 'virtual-disabled' : ''}`}>{face ? 'Sustituir fotografía' : 'Elegir fotografía'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => chooseReference('face', event)} />
                      </label>
                      {face && <button className="button-secondary" disabled={Boolean(busy)} onClick={() => removeImage('face')}><Trash2 size={16} /> Eliminar</button>}
                    </div>
                  </section>}
                  {needsMannequin && <section className="virtual-card">
                    <h2>Fotografía del maniquí</h2>
                    <p>JPG, PNG o WebP, hasta 5 MB. Se guarda de forma privada en Firebase Storage y puedes eliminarla cuando quieras.</p>
                    <p>Procura que se vean claramente las proporciones y postura del maniquí.</p>
                    {mannequinUrl && <img className="virtual-preview" src={mannequinUrl} alt="Referencia del maniquí" />}
                    <div className="virtual-actions">
                      <label className={`button-secondary virtual-upload ${busy ? 'virtual-disabled' : ''}`}>{mannequin ? 'Sustituir fotografía' : 'Elegir fotografía'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => chooseReference('mannequin', event)} />
                      </label>
                      {mannequin && <button className="button-secondary" disabled={Boolean(busy)} onClick={() => removeImage('mannequin')}><Trash2 size={16} /> Eliminar</button>}
                    </div>
                  </section>}
                </div>
              )}
              <section className="virtual-card">
                <h2>Prendas del conjunto <span className="optional">({garmentIds.length} seleccionadas, máximo 6)</span></h2>
                {garments.length ? <div className="garment-picker virtual-garment-picker">{garments.map((garment) => (
                  <label key={garment.id} className={`garment-picker-item ${garmentIds.includes(garment.id) ? 'garment-picker-selected' : ''}`}>
                    <input type="checkbox" disabled={Boolean(busy) || (!garmentIds.includes(garment.id) && garmentIds.length >= 6)} checked={garmentIds.includes(garment.id)} onChange={() => { setGarmentIds((items) => items.includes(garment.id) ? items.filter((id) => id !== garment.id) : [...items, garment.id]); setConsent(false); }} />
                    {garment.imageUrl ? <img src={garment.imageUrl} alt="" /> : <span className="picker-placeholder"><Shirt size={17} /></span>}
                    <span><strong>{garment.name}</strong><small>{garment.color}</small></span><span className="picker-check"><Check size={14} /></span>
                  </label>
                ))}</div> : <p>Añade prendas con fotografía en <Link to="/armario">Mi armario</Link>.</p>}
              </section>
              <section className="virtual-card virtual-consent">
                <h2>Generar composición</h2>
                <p>Las fotografías de referencia necesarias y las prendas seleccionadas se enviarán a Google Vertex AI en una única petición. El endpoint de generación es global; no se garantiza que el procesamiento se realice en España o dentro de la Unión Europea. El resultado es orientativo y no garantiza la talla ni el ajuste real.</p>
                <p>Cada composición puede generar costes y sustituirá el resultado guardado anterior.</p>
                <label className="virtual-checkbox"><input type="checkbox" checked={consent} disabled={Boolean(busy)} onChange={(event) => setConsent(event.target.checked)} /> Acepto el envío de las fotografías de referencia seleccionadas y las prendas a Google Vertex AI para esta composición.</label>
                <button className="button-primary" disabled={Boolean(busy) || !garmentIds.length || (needsFace && !face) || (needsMannequin && !mannequin) || !consent} onClick={generateCustom}>
                  {busy === 'Generando simulación…' ? <span className="button-spinner" /> : <Sparkles size={17} />}
                  {busy || 'Generar composición'}
                </button>
              </section>
            </>
          )}
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
