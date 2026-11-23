import { useEffect, useState, type FormEvent } from 'react';
import { X, Upload, ImagePlus } from 'lucide-react';
import type { ClothingStyle, Garment, GarmentCategory, GarmentInput, Season } from '../types';

const categories: Array<{ value: GarmentCategory; label: string }> = [
  { value: 'camisetas', label: 'Camisetas' },
  { value: 'camisas', label: 'Camisas' },
  { value: 'pantalones', label: 'Pantalones' },
  { value: 'vestidos', label: 'Vestidos' },
  { value: 'chaquetas', label: 'Chaquetas' },
  { value: 'abrigos', label: 'Abrigos' },
  { value: 'calzado', label: 'Calzado' },
  { value: 'complementos', label: 'Complementos' },
];

const seasons: Season[] = ['primavera', 'verano', 'otoño', 'invierno', 'todo el año'];
const styles: ClothingStyle[] = ['casual', 'formal', 'deportivo', 'minimalista', 'clásico', 'urbano'];

export function GarmentForm({ garment, onClose, onSave }: {
  garment?: Garment;
  onClose: () => void;
  onSave: (input: GarmentInput, photo?: File) => Promise<void>;
}) {
  const [name, setName] = useState(garment?.name ?? '');
  const [category, setCategory] = useState<GarmentCategory>(garment?.category ?? 'camisetas');
  const [color, setColor] = useState(garment?.color ?? '');
  const [brand, setBrand] = useState(garment?.brand ?? '');
  const [price, setPrice] = useState(garment?.price?.toString().replace('.', ',') ?? '');
  const [description, setDescription] = useState(garment?.description ?? '');
  const [selectedSeasons, setSelectedSeasons] = useState<Season[]>(garment?.season ?? []);
  const [selectedStyles, setSelectedStyles] = useState<ClothingStyle[]>(garment?.style ?? []);
  const [photo, setPhoto] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState(garment?.imageUrl);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function toggle<T extends string>(value: T, selected: T[], update: (next: T[]) => void) {
    update(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!name.trim() || !color.trim()) {
      setError('Escribe un nombre y un color para la prenda.');
      return;
    }
    const parsedPrice = Number(price.replace(',', '.'));
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(price) || !Number.isFinite(parsedPrice)) {
      setError('Indica un precio válido en euros con hasta dos decimales.');
      return;
    }
    if (photoError) {
      setError(photoError);
      return;
    }
    if (selectedSeasons.length === 0 || selectedStyles.length === 0) {
      setError('Elige al menos una temporada y un estilo.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        category,
        color: color.trim(),
        brand: brand.trim(),
        price: parsedPrice,
        description: description.trim(),
        season: selectedSeasons,
        style: selectedStyles,
      }, photo);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la prenda.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal-panel garment-modal" role="dialog" aria-modal="true" aria-labelledby="garment-form-title">
        <div className="modal-header">
          <div><span className="eyebrow">{garment ? 'EDITAR FICHA' : 'NUEVA PRENDA'}</span><h2 id="garment-form-title">{garment ? 'Tu prenda, al día' : 'Añade algo especial'}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="garment-form">
          <div className="form-grid">
            <label className="field">Nombre de la prenda<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Camiseta de lino" /></label>
            <label className="field">Categoría<select value={category} onChange={(event) => setCategory(event.target.value as GarmentCategory)}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="field">Color<input required maxLength={40} value={color} onChange={(event) => setColor(event.target.value)} placeholder="Ej. Azul marino" /></label>
            <label className="field"><span>Marca <span className="optional">(opcional)</span></span><input maxLength={60} value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="¿De dónde viene?" /></label>
            <label className="field">Precio (€)<input type="text" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Ej. 25,50" /></label>
            <fieldset className="field field-wide choice-field">
              <legend>Temporada</legend>
              <div className="choice-pills">{seasons.map((item) => <label key={item} className={`choice-pill ${selectedSeasons.includes(item) ? 'choice-selected' : ''}`}><input type="checkbox" checked={selectedSeasons.includes(item)} onChange={() => toggle(item, selectedSeasons, setSelectedSeasons)} />{item}</label>)}</div>
            </fieldset>
            <fieldset className="field field-wide choice-field">
              <legend>Estilo</legend>
              <div className="choice-pills">{styles.map((item) => <label key={item} className={`choice-pill ${selectedStyles.includes(item) ? 'choice-selected' : ''}`}><input type="checkbox" checked={selectedStyles.includes(item)} onChange={() => toggle(item, selectedStyles, setSelectedStyles)} />{item}</label>)}</div>
            </fieldset>
            <label className="field field-wide"><span>Notas <span className="optional">(opcional)</span></span><textarea rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Un detalle que quieras recordar…" /></label>
            <div className="field field-wide"><span className="field-label">Fotografía <span className="optional">(JPG, PNG o WebP · máx. 5 MB)</span></span>
              <label className="photo-upload">
                {previewUrl ? <img src={previewUrl} alt="Vista previa de la prenda" /> : <span className="photo-placeholder"><ImagePlus size={23} /><span>Añadir fotografía</span></span>}
                <span className="photo-upload-action"><Upload size={15} />{previewUrl ? 'Cambiar foto' : 'Elegir archivo'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected && (selected.size > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(selected.type))) {
                    setPhotoError('La foto debe ser JPG, PNG o WebP y pesar hasta 5 MB.');
                    event.target.value = '';
                    setPhoto(undefined);
                    setPreviewUrl(garment?.imageUrl);
                    setError('La foto debe ser JPG, PNG o WebP y pesar hasta 5 MB.');
                    return;
                  }
                  setPhotoError('');
                  setError('');
                  setPhoto(selected);
                }} />
              </label>
            </div>
          </div>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <div className="modal-footer"><button type="button" className="button-secondary" onClick={onClose}>Cancelar</button><button className="button-primary" disabled={saving}>{saving ? 'Guardando…' : garment ? 'Guardar cambios' : 'Añadir al armario'}</button></div>
        </form>
      </section>
    </div>
  );
}
