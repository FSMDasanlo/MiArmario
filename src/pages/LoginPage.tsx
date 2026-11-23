import { useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Notice } from '../components/AppShell';
import { auth, firebaseConfigured } from '../firebase/client';
import { logoUrl } from '../brand';

function readableAuthError(error: unknown) {
  if (!(error instanceof FirebaseError)) return error instanceof Error ? error.message : 'No se pudo acceder.';
  if (error.code === 'auth/popup-closed-by-user') return 'Se cerró la ventana de Google antes de iniciar sesión.';
  if (error.code === 'auth/popup-blocked') return 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.';
  if (error.code === 'auth/unauthorized-domain') return 'Este dominio no está autorizado en Firebase Authentication.';
  if (error.code === 'auth/operation-not-allowed') return 'El inicio de sesión con Google no está activado en Firebase Authentication.';
  if (error.code === 'auth/account-exists-with-different-credential') return 'Ya existe una cuenta con ese correo y otro método de acceso. Contacta con el administrador.';
  return error.message;
}

export function LoginPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const destination = (location.state as { from?: string } | null)?.from || '/';

  if (user) return <Navigate to={destination} replace />;

  async function signInWithGoogle() {
    if (!auth) {
      setError('Configura Firebase para iniciar sesión.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate(destination, { replace: true });
    } catch (authError) {
      setError(readableAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-brand"><Link to="/"><img src={logoUrl} alt="MiArmario" /></Link><Link className="back-link" to="/"><ArrowLeft size={16} /> Volver al inicio</Link></div>
      <section className="login-card">
        <div className="login-icon"><Sparkles size={22} /></div>
        <span className="eyebrow">{firebaseConfigured ? 'TU ESPACIO PRIVADO' : 'UN PASO ANTES DE EMPEZAR'}</span>
        <h1>{firebaseConfigured ? 'Qué gusto verte' : 'Conectemos tu armario'}</h1>
        <p>{firebaseConfigured ? 'Inicia sesión con Google para volver a tu estilo.' : 'La autenticación está lista, pero todavía faltan los datos de tu proyecto Firebase.'}</p>
        {!firebaseConfigured ? <div className="firebase-steps"><Notice tone="info">No se han añadido credenciales ni se han creado datos ficticios.</Notice><ol><li>Crea un proyecto Firebase y una aplicación web.</li><li>Activa el proveedor Google en Authentication.</li><li>Copia sus valores reales en un archivo local <code>.env.local</code>, siguiendo <code>.env.example</code>.</li><li>Reinicia el servidor de desarrollo.</li></ol><p>La clave privada de Groq no va aquí: se configura de forma segura en Cloud Functions.</p></div> : <>
          {error && <Notice>{error}</Notice>}
          <button className="button-primary login-submit" onClick={() => void signInWithGoogle()} disabled={busy}>{busy ? 'Un momento…' : 'Iniciar sesión con Google'} <ArrowRight size={17} /></button>
        </>}
      </section>
      <p className="login-footer">Organiza · Combina · Viste mejor.</p>
    </main>
  );
}
