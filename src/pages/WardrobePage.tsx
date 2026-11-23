import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, SlidersHorizontal, Shirt, Pencil, Trash2, ImageOff, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, MobileAddButton, Notice, PageHeading, PrimaryButton } from '../components/AppShell';
import { GarmentForm } from '../components/GarmentForm';
import { useAuth } from '../auth/AuthProvider';
import { firebaseConfigured } from '../firebase/client';
import { listGarments, removeGarment, saveGarment } from '../services/garments';
import { garmentCategories, type Garment, type GarmentCategory } from '../types';

const categoryLabels: Record<GarmentCategory, string> = {
  camisetas: 'Camisetas', camisas: 'Camisas', pantalones: 'Pantalones', vestidos: 'Vestidos',
  chaquetas: 'Chaquetas', abrigos: 'Abrigos', calzado: 'Calzado', complementos: 'Complementos',
};
const colorSwatches: Record<string, string> = {
  negro: '#25262a', blanco: '#f5f2e9', gris: '#999b9d', rojo: '#c54b55',
  azul: '#4e6f9d', 'azul marino': '#263b5b', verde: '#6f8e71', beige: '#c7b695',
  marrón: '#806044', rosa: '#d58ea1', amarillo: '#e5c763', naranja: '#d98952',
  morado: '#8a72a3', crema: '#ede5d0',
};

function colorSwatch(color: string) {
  const normalized = color.trim().toLocaleLowerCase('es');
  if (/^#[0-9a-f]{3,8}$/i.test(normalized)) return normalized;
  return colorSwatches[normalized] ?? '#c6a9a0';
}

export function WardrobePage() {
  const { user } = useAuth();
  const [garments, setGarments] = useState<Garment[]>([]);
  const [category, setCategory] = useState<GarmentCategory | 'todas'>('todas');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Garment>();
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(user));
  const searchInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setGarments(await listGarments(user.uid));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el armario.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const filtered = useMemo(() => garments.filter((garment) => {
    const matchesCategory = category === 'todas' || garment.category === category;
    const query = search.trim().toLocaleLowerCase('es');
    const matchesSearch = !query || [garment.name, garment.color, garment.brand, ...garment.style].join(' ').toLocaleLowerCase('es').includes(query);
    return matchesCategory && matchesSearch;
  }), [category, garments, search]);

  async function save(input: Parameters<typeof saveGarment>[1], photo?: File) {
    if (!user) return;
    await saveGarment(user.uid, input, editing?.id, photo);
    setFormOpen(false);
    setEditing(undefined);
    await refresh();
  }

  async function remove(garment: Garment) {
    if (!user || !window.confirm(`¿Eliminar «${garment.name}» de tu armario?`)) return;
    try {
      await removeGarment(user.uid, garment);
      setGarments((items) => items.filter((item) => item.id !== garment.id));
      setError('');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'No se pudo eliminar la prenda.');
    }
  }

  function startEdit(garment?: Garment) {
    setEditing(garment);
    setFormOpen(true);
  }

  return (
    <div className="wardrobe-page">
      <PageHeading title="Mi armario" action={<PrimaryButton onClick={() => startEdit()} disabled={!user}>Añadir prenda</PrimaryButton>} />
      {error && <Notice>{error}</Notice>}
      <div className="wardrobe-toolbar">
        <label className="search-box"><Search size={18} /><input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Busca por nombre, color o estilo…" aria-label="Buscar prendas" aria-keyshortcuts="Control+K Meta+K" /><kbd>Ctrl K</kbd></label>
        <label className="filter-select"><SlidersHorizontal size={16} /><select value={category} onChange={(event) => setCategory(event.target.value as GarmentCategory | 'todas')} aria-label="Filtrar por categoría"><option value="todas">Todas las categorías</option>{garmentCategories.map((item) => <option key={item} value={item}>{categoryLabels[item]}</option>)}</select></label>
        <span className="result-count">{filtered.length} {filtered.length === 1 ? 'prenda' : 'prendas'}</span>
      </div>
      {loading ? <div className="loading-panel">Abriendo tu armario…</div> : filtered.length ? (
        <div className="garment-grid">
          {filtered.map((garment) => <article className="garment-card" key={garment.id}>
            <div className="garment-photo">
              {garment.imageUrl ? <img src={garment.imageUrl} alt={garment.name} loading="lazy" /> : <div className="garment-photo-placeholder"><ImageOff size={25} /><span>Sin fotografía</span></div>}
              <span className="garment-category">{categoryLabels[garment.category]}</span>
              <div className="garment-actions"><button onClick={() => startEdit(garment)} aria-label={`Editar ${garment.name}`}><Pencil size={15} /></button><button onClick={() => void remove(garment)} aria-label={`Eliminar ${garment.name}`}><Trash2 size={15} /></button></div>
            </div>
            <div className="garment-info"><div><h3>{garment.name}</h3><p>{garment.brand || garment.color}</p>{garment.price !== undefined && <p>{garment.price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>}</div><span className="color-swatch" title={garment.color}><i style={{ backgroundColor: colorSwatch(garment.color) }} />{garment.color}</span></div>
            <div className="garment-tags">{garment.style.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{garment.season.slice(0, 1).map((tag) => <span key={tag} className="season-tag"><Sparkles size={11} />{tag}</span>)}</div>
          </article>)}
        </div>
      ) : (
        <EmptyState
          icon={<Shirt size={25} />}
          title={search || category !== 'todas' ? 'No encontramos prendas' : 'Tu armario empieza aquí'}
          body={search || category !== 'todas' ? 'Prueba con otro término o categoría.' : 'Añade tus prendas y tendrás todo listo para combinar, consultar y volver a descubrir.'}
          action={!search && category === 'todas' ? <PrimaryButton onClick={() => startEdit()} disabled={!user}>Añadir primera prenda</PrimaryButton> : undefined}
        />
      )}
      {!firebaseConfigured && <div className="inline-hint">Conecta Firebase para guardar prendas y fotografías en tu cuenta. <Link to="/acceso">Ver cómo configurarlo</Link></div>}
      {user && !formOpen && <MobileAddButton onClick={() => startEdit()} />}
      {formOpen && <GarmentForm garment={editing} onClose={() => { setFormOpen(false); setEditing(undefined); }} onSave={save} />}
    </div>
  );
}
