import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarHeart, Check, Heart, Pencil, Shirt, Trash2, X } from 'lucide-react';
import { EmptyState, MobileAddButton, Notice, PageHeading, PrimaryButton } from '../components/AppShell';
import { useAuth } from '../auth/AuthProvider';
import { firebaseConfigured } from '../firebase/client';
import { listGarments } from '../services/garments';
import { listOutfits, removeOutfit, saveOutfit } from '../services/outfits';
import type { Garment, Outfit, OutfitInput } from '../types';

function OutfitForm({ outfit, garments, onClose, onSave }: {
  outfit?: Outfit;
  garments: Garment[];
  onClose: () => void;
  onSave: (input: OutfitInput) => Promise<void>;
}) {
  const [name, setName] = useState(outfit?.name ?? '');
  const [occasion, setOccasion] = useState(outfit?.occasion ?? '');
  const [description, setDescription] = useState(outfit?.description ?? '');
  const [garmentIds, setGarmentIds] = useState<string[]>(outfit?.garmentIds ?? []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Escribe un nombre para el conjunto.');
      return;
    }
    if (garmentIds.length === 0) {
      setError('Elige al menos una prenda para guardar el conjunto.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), occasion: occasion.trim(), description: description.trim(), garmentIds });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el conjunto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="outfit-form-title">
        <div className="modal-header"><div><span className="eyebrow">{outfit ? 'EDITAR CONJUNTO' : 'NUEVO CONJUNTO'}</span><h2 id="outfit-form-title">{outfit ? 'Tu combinación' : 'Guarda tu combinación'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div>
        <form className="garment-form" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Nombre<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Un viernes especial" /></label>
            <label className="field"><span>Ocasión <span className="optional">(opcional)</span></span><input maxLength={80} value={occasion} onChange={(event) => setOccasion(event.target.value)} placeholder="Trabajo, paseo, cena…" /></label>
            <label className="field field-wide"><span>Descripción <span className="optional">(opcional)</span></span><textarea rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="¿Qué te gusta de este conjunto?" /></label>
            <fieldset className="field field-wide choice-field">
              <legend>Prendas del conjunto <span className="optional">({garmentIds.length} seleccionadas)</span></legend>
              {garments.length ? <div className="garment-picker">{garments.map((garment) => (
                <label key={garment.id} className={`garment-picker-item ${garmentIds.includes(garment.id) ? 'garment-picker-selected' : ''}`}>
                  <input type="checkbox" checked={garmentIds.includes(garment.id)} onChange={() => setGarmentIds((items) => items.includes(garment.id) ? items.filter((id) => id !== garment.id) : [...items, garment.id])} />
                  {garment.imageUrl ? <img src={garment.imageUrl} alt="" /> : <span className="picker-placeholder"><Shirt size={17} /></span>}
                  <span><strong>{garment.name}</strong><small>{garment.color}</small></span><span className="picker-check"><Check size={14} /></span>
                </label>
              ))}</div> : <p className="picker-empty">Añade prendas a tu armario antes de crear un conjunto.</p>}
            </fieldset>
          </div>
          {error && <Notice>{error}</Notice>}
          <div className="modal-footer"><button type="button" className="button-secondary" onClick={onClose}>Cancelar</button><button className="button-primary" disabled={saving || garments.length === 0}>{saving ? 'Guardando…' : outfit ? 'Guardar cambios' : 'Guardar conjunto'}</button></div>
        </form>
      </section>
    </div>
  );
}

export function OutfitsPage() {
  const { user } = useAuth();
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [garments, setGarments] = useState<Garment[]>([]);
  const [editing, setEditing] = useState<Outfit>();
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(user));

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [nextOutfits, nextGarments] = await Promise.all([listOutfits(user.uid), listGarments(user.uid)]);
      setOutfits(nextOutfits);
      setGarments(nextGarments);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los conjuntos.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function save(input: OutfitInput) {
    if (!user) return;
    await saveOutfit(user.uid, input, editing?.id);
    setFormOpen(false);
    setEditing(undefined);
    await refresh();
  }

  async function remove(outfit: Outfit) {
    if (!user || !window.confirm(`¿Eliminar el conjunto «${outfit.name}»?`)) return;
    try {
      await removeOutfit(user.uid, outfit.id);
      setOutfits((items) => items.filter((item) => item.id !== outfit.id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'No se pudo eliminar el conjunto.');
    }
  }

  function edit(outfit?: Outfit) { setEditing(outfit); setFormOpen(true); }

  return (
    <div className="outfits-page">
      <PageHeading title="Mis conjuntos" action={<PrimaryButton onClick={() => edit()} disabled={!user || garments.length === 0}>Crear conjunto</PrimaryButton>} />
      {error && <Notice>{error}</Notice>}
      {loading ? <div className="loading-panel">Reuniendo tus conjuntos…</div> : outfits.length ? <div className="outfit-grid">
        {outfits.map((outfit) => {
          const pieces = outfit.garmentIds.map((id) => garments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item));
          return <article className="outfit-card" key={outfit.id}>
            <div className="outfit-collage">{pieces.slice(0, 3).map((piece, index) => <div key={piece.id} className={`collage-piece collage-piece-${index + 1}`}>{piece.imageUrl ? <img src={piece.imageUrl} alt={piece.name} /> : <Shirt size={24} />}</div>)}{pieces.length === 0 && <div className="collage-no-image"><Shirt size={28} /><span>Prendas ya no disponibles</span></div>}<div className="outfit-card-actions"><button onClick={() => edit(outfit)} aria-label={`Editar ${outfit.name}`}><Pencil size={15} /></button><button onClick={() => void remove(outfit)} aria-label={`Eliminar ${outfit.name}`}><Trash2 size={15} /></button></div></div>
            <div className="outfit-card-content"><span className="outfit-occasion"><CalendarHeart size={14} />{outfit.occasion || 'Para cualquier día'}</span><h3>{outfit.name}</h3>{outfit.description && <p>{outfit.description}</p>}<div className="outfit-piece-list">{pieces.slice(0, 4).map((piece) => <span key={piece.id}>{piece.name}</span>)}{pieces.length > 4 && <span>+{pieces.length - 4}</span>}</div><span className="outfit-count"><Shirt size={14} /> {pieces.length} {pieces.length === 1 ? 'prenda' : 'prendas'}</span></div>
          </article>;
        })}
      </div> : <EmptyState icon={<Heart size={25} />} title="Tus mejores combinaciones, guardadas" body={garments.length ? 'Crea un conjunto con prendas de tu armario y vuelve a él cuando quieras.' : 'Primero añade prendas a tu armario; después podrás combinarlas y guardar tus conjuntos favoritos.'} action={garments.length ? <PrimaryButton onClick={() => edit()} disabled={!user}>Crear primer conjunto</PrimaryButton> : undefined} />}
      {!firebaseConfigured && <div className="inline-hint">Tus conjuntos y prendas se guardarán de forma privada al configurar Firebase.</div>}
      {user && !formOpen && <MobileAddButton onClick={() => edit()} />}
      {formOpen && <OutfitForm outfit={editing} garments={garments} onClose={() => { setFormOpen(false); setEditing(undefined); }} onSave={save} />}
    </div>
  );
}
