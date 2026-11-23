import { useEffect, useState } from 'react';
import { Heart, Shirt, WandSparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Notice, PageHeading } from '../components/AppShell';
import { useAuth } from '../auth/AuthProvider';
import { listGarments } from '../services/garments';
import { listOutfits } from '../services/outfits';
import { firebaseConfigured } from '../firebase/client';

export function DashboardPage() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ garments: 0, outfits: 0 });
  const [error, setError] = useState('');
  const firstName = user?.displayName?.split(' ')[0];

  useEffect(() => {
    if (!user || !firebaseConfigured) return;
    Promise.all([listGarments(user.uid), listOutfits(user.uid)])
      .then(([garments, outfits]) => setCounts({ garments: garments.length, outfits: outfits.length }))
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el resumen.'));
  }, [user]);

  return (
    <div className="dashboard-page">
      <PageHeading title={`Resumen${firstName ? ` de ${firstName}` : ''}`} />
      {error && <Notice>{error}</Notice>}
      <section className="dashboard-overview">
        <div className="overview-grid">
          <Link to="/armario" className="overview-card">
            <span className="overview-icon icon-navy"><Shirt size={19} /></span><span className="overview-label">Prendas guardadas</span><strong>{counts.garments}</strong><span className="overview-foot">Ver mi armario</span>
          </Link>
          <Link to="/conjuntos" className="overview-card">
            <span className="overview-icon icon-rose"><Heart size={19} /></span><span className="overview-label">Conjuntos guardados</span><strong>{counts.outfits}</strong><span className="overview-foot">Ver mis conjuntos</span>
          </Link>
          <Link to="/asistente" className="overview-card overview-idea">
            <span className="overview-icon icon-gold"><WandSparkles size={19} /></span><span className="overview-label">Estilista IA</span><strong className="idea-title">Pide una recomendación</strong><span className="overview-foot">Abrir asistente</span>
          </Link>
        </div>
      </section>

      {!firebaseConfigured && <p className="dashboard-setup-footnote">La experiencia completa estará disponible cuando conectes Firebase. No se almacenan datos de ejemplo en esta vista.</p>}
    </div>
  );
}
