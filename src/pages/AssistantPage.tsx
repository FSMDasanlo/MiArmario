import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUp, Bot, Check, CircleHelp, Shirt, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Notice, PageHeading } from '../components/AppShell';
import { useAuth } from '../auth/AuthProvider';
import { firebaseConfigured } from '../firebase/client';
import { askWardrobeAssistant, type AssistantResponse } from '../services/assistant';
import { listGarments } from '../services/garments';
import type { Garment } from '../types';

const promptIdeas = [
  { label: 'Cena informal', question: '¿Qué me pongo para una cena informal?' },
  { label: 'Prendas que combino poco', question: 'Ayúdame a sacar partido a prendas que combino poco' },
  { label: 'Día de otoño', question: 'Propón algo cómodo para un día de otoño' },
];

export function AssistantPage() {
  const { user } = useAuth();
  const [garments, setGarments] = useState<Garment[]>([]);
  const [question, setQuestion] = useState('');
  const [occasion, setOccasion] = useState('');
  const [weather, setWeather] = useState('');
  const [season, setSeason] = useState('');
  const [style, setStyle] = useState('');
  const [response, setResponse] = useState<AssistantResponse>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [garmentCount, setGarmentCount] = useState<number>();

  useEffect(() => {
    if (!user) return;
    listGarments(user.uid).then((items) => {
      setGarments(items);
      setGarmentCount(items.length);
    }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo consultar tu armario.');
    });
  }, [user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError('');
    setResponse(undefined);
    try {
      setResponse(await askWardrobeAssistant({ question: question.trim(), occasion, weather, season, style }));
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : 'No se pudo obtener una recomendación.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="assistant-page">
      <PageHeading title="Tu estilista personal" />
      <div className="assistant-layout">
        <section className="assistant-main">
          {garmentCount === 0 && user && <Notice tone="info">Tu armario todavía está vacío. <Link to="/armario">Añade algunas prendas</Link> para recibir sugerencias personalizadas.</Notice>}
          {!firebaseConfigured && <Notice tone="info">Conecta Firebase para consultar tus prendas. La IA se activa cuando configures también la función segura de Groq.</Notice>}
          {error && <Notice>{error}</Notice>}
          <form className="assistant-composer" onSubmit={submit}>
            <label htmlFor="assistant-question">Tu pregunta</label>
            <textarea id="assistant-question" rows={3} maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="¿Qué ocasión tienes? ¿Cómo te gustaría sentirte?" />
            <div className="composer-bottom"><span>La IA solo considera prendas de tu armario.</span><button aria-label="Enviar consulta" disabled={loading || !user || !firebaseConfigured || !question.trim()}>{loading ? <span className="button-spinner" /> : <ArrowUp size={19} />}</button></div>
          </form>
          <div className="prompt-suggestions"><span>Prueba a preguntar:</span>{promptIdeas.map((idea) => <button key={idea.label} onClick={() => setQuestion(idea.question)}>{idea.label}<ArrowUp size={13} /></button>)}</div>
          {response && <section className="assistant-response" aria-live="polite">
            <div className="response-heading"><span className="response-bot"><Bot size={17} /></span><span>MIARMARIO <small>AHORA</small></span></div>
            <p className="response-answer">{response.answer}</p>
            {response.recommendations.map((recommendation, index) => {
              const pieces = recommendation.garmentIds.map((id) => garments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item));
              return <article className="recommendation-card" key={`${recommendation.name}-${index}`}>
                <div className="recommendation-top"><span>IDEA {String(index + 1).padStart(2, '0')}</span><strong>{recommendation.name}</strong><Sparkles size={16} /></div>
                <div className="recommendation-pieces">{pieces.map((piece) => <span className="recommendation-piece" key={piece.id}>{piece.imageUrl ? <img src={piece.imageUrl} alt="" /> : <span className="recommendation-placeholder"><Shirt size={15} /></span>}<span><strong>{piece.name}</strong><small>{piece.color}</small></span><Check size={15} /></span>)}</div>
                <p className="recommendation-reason">{recommendation.reasoning}</p>
              </article>;
            })}
          </section>}
        </section>
        <aside className="assistant-sidebar">
          <div className="assistant-context-card"><strong>{garmentCount === undefined ? 'Armario no disponible' : `${garmentCount} ${garmentCount === 1 ? 'prenda' : 'prendas'}`}</strong><Link to="/armario">Ver armario →</Link></div>
          <div className="context-fields"><div className="context-fields-title"><CircleHelp size={16} /><strong>Afina tu idea</strong></div><label>Ocasión<input value={occasion} onChange={(event) => setOccasion(event.target.value)} placeholder="Ej. Comida" maxLength={80} /></label><label>Clima<input value={weather} onChange={(event) => setWeather(event.target.value)} placeholder="Ej. 18 °C" maxLength={80} /></label><label>Temporada<select value={season} onChange={(event) => setSeason(event.target.value)}><option value="">Cualquiera</option><option>primavera</option><option>verano</option><option>otoño</option><option>invierno</option></select></label><label>Estilo que te apetece<select value={style} onChange={(event) => setStyle(event.target.value)}><option value="">Sorpréndeme</option><option>casual</option><option>formal</option><option>deportivo</option><option>minimalista</option><option>clásico</option><option>urbano</option></select></label></div>
          <p className="assistant-privacy"><Sparkles size={14} /> Tus prendas son privadas. La consulta se procesa en el servidor.</p>
        </aside>
      </div>
    </div>
  );
}
