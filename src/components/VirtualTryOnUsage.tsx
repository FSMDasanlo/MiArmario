import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getVirtualTryOnUsage } from '../services/virtualTryOn';

function todayInMadrid() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function VirtualTryOnUsage({ userId }: { userId: string }) {
  const [today] = useState(todayInMadrid);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<Awaited<ReturnType<typeof getVirtualTryOnUsage>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  async function load(start: string, end: string) {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const result = await getVirtualTryOnUsage(userId, start, end);
      if (requestId.current === currentRequest) setReport(result);
    } catch (caught) {
      if (requestId.current === currentRequest) setError(caught instanceof Error ? caught.message : 'No se pudo consultar el control de pruebas.');
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }

  useEffect(() => {
    void load(`${today.slice(0, 7)}-01`, today);
    return () => { requestId.current++; };
  }, [userId, today]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || from > to) {
      setReport(null);
      setError('Selecciona un intervalo de fechas válido.');
      return;
    }
    void load(from, to);
  }

  return (
    <section className="virtual-card">
      <h2>Control de pruebas</h2>
      <p>Intentos enviados a la IA, incluso si fallan. Fechas de España peninsular; el registro comienza cuando se activa esta función y no equivale a la factura.</p>
      <form className="usage-filters" onSubmit={submit}>
        <label className="field">Desde<input type="date" required disabled={loading} value={from} onChange={(event) => { setFrom(event.target.value); setReport(null); }} /></label>
        <label className="field">Hasta<input type="date" required disabled={loading} value={to} onChange={(event) => { setTo(event.target.value); setReport(null); }} /></label>
        <button className="button-secondary" disabled={loading}>Consultar</button>
      </form>
      {loading && <p role="status">Consultando intentos…</p>}
      {error && <div className="notice" role="alert">{error}</div>}
      {report && (
        <div className="usage-table-container">
          <table className="usage-table">
            <thead><tr><th scope="col">Usuario</th><th scope="col">Intentos</th></tr></thead>
            <tbody>
              {report.users.map((user) => <tr key={user.uid}><td>{user.email || user.uid}</td><td>{user.count}</td></tr>)}
              {!report.users.length && <tr><td colSpan={2}>No hay intentos registrados en estas fechas.</td></tr>}
            </tbody>
            <tfoot><tr><th scope="row">Total</th><td>{report.total}</td></tr></tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
