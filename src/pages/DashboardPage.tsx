import { useEffect, useState } from 'react';
import { ArrowRight, Heart, Shirt, Sparkles, Sun, WandSparkles } from 'lucide-react';
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
      <PageHeading eyebrow="TU ESTILO, A TU MANERA" title={`Buenos días${firstName ? `, ${firstName}` : ''}`} description="Un armario más consciente empieza con una buena idea." />
      {error && <Notice>{error}</Notice>}
      <section className="welcome-hero">
        <div className="hero-copy">
          <span className="hero-kicker"><Sun size={15} /> TU RINCÓN DE ESTILO</span>
          <h2>Vístete como<br />te sientes <em>hoy.</em></h2>
          <p>Todo lo que tienes, todo lo que te gusta y nuevas formas de combinarlo. En un mismo lugar.</p>
          <Link className="hero-cta" to="/armario">Explorar mi armario <ArrowRight size={17} /></Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="hero-cloth cloth-back" /><div className="hero-cloth cloth-front" />
          <span className="hero-sparkle sparkle-one">✳</span><span className="hero-sparkle sparkle-two">✦</span>
          <div className="hero-note"><span>tu estilo</span><strong>sin reglas</strong></div>
        </div>
        <div className="hero-decoration">MA</div>
      </section>

      <section className="dashboard-overview">
        <div className="section-title-row"><div><span className="eyebrow">POCO A POCO</span><h2>Tu armario toma forma</h2></div><Link to="/armario" className="text-link">Ver armario <ArrowRight size={15} /></Link></div>
        <div className="overview-grid">
          <Link to="/armario" className="overview-card">
            <span className="overview-icon icon-navy"><Shirt size={19} /></span><span className="overview-label">Prendas guardadas</span><strong>{counts.garments}</strong><span className="overview-foot">{counts.garments === 1 ? 'una pieza, infinitas ideas' : 'añade tus primeras prendas'}</span>
          </Link>
          <Link to="/conjuntos" className="overview-card">
            <span className="overview-icon icon-rose"><Heart size={19} /></span><span className="overview-label">Conjuntos favoritos</span><strong>{counts.outfits}</strong><span className="overview-foot">tus combinaciones especiales</span>
          </Link>
          <Link to="/asistente" className="overview-card overview-idea">
            <span className="overview-icon icon-gold"><WandSparkles size={19} /></span><span className="overview-label">Una idea para hoy</span><strong className="idea-title">Combina distinto</strong><span className="overview-foot">Tu estilista te ayuda a descubrirlo <ArrowRight size={13} /></span>
          </Link>
        </div>
      </section>

      <section className="dashboard-bottom">
        <div className="quote-card"><span className="quote-mark">“</span><p>El mejor conjunto es el que te hace sentir tú.</p><span>UN RECORDATORIO DE ESTILO</span></div>
        <Link to="/asistente" className="assistant-promo"><div className="assistant-promo-icon"><Sparkles size={19} /></div><div><span className="eyebrow">A UN TOQUE DE DISTANCIA</span><h3>¿No sabes qué ponerte?</h3><p>Cuéntale tus planes a tu estilista y descubre opciones de tu propio armario.</p><span className="text-link">Hablar con el asistente <ArrowRight size={15} /></span></div><span className="promo-flower">✳</span></Link>
      </section>
      {!firebaseConfigured && <p className="dashboard-setup-footnote">La experiencia completa estará disponible cuando conectes Firebase. No se almacenan datos de ejemplo en esta vista.</p>}
    </div>
  );
}
