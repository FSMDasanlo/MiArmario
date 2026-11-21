import { useState, type FormEvent } from 'react';
import { FirebaseError } from 'firebase/app';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Notice } from '../components/AppShell';
import { auth, firebaseConfigured } from '../firebase/client';
import { logoUrl } from '../brand';

function readableAuthError(error: unknown) {
  if (!(error instanceof FirebaseError)) return error instanceof Error ? error.message : 'No se pudo acceder.';
  if (error.code === 'auth/invalid-credential') return 'El correo o la contraseña no son correctos.';
  if (error.code === 'auth/email-already-in-use') return 'Ya existe una cuenta con ese correo.';
  if (error.code === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres.';
  if (error.code === 'auth/invalid-email') return 'Escribe un correo electrónico válido.';
  return error.message;
}

export function LoginPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const destination = (location.state as { from?: string } | null)?.from || '/';

  if (user) return <Navigate to={destination} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setError('');
    setBusy(true);
    try {
      if (register) {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
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
        <h1>{firebaseConfigured ? register ? 'Crea tu cuenta' : 'Qué gusto verte' : 'Conectemos tu armario'}</h1>
        <p>{firebaseConfigured ? register ? 'Un espacio solo tuyo para todas tus prendas.' : 'Inicia sesión para volver a tu estilo.' : 'La autenticación está lista, pero todavía faltan los datos de tu proyecto Firebase.'}</p>
        {!firebaseConfigured ? <div className="firebase-steps"><Notice tone="info">No se han añadido credenciales ni se han creado datos ficticios.</Notice><ol><li>Crea un proyecto Firebase y una aplicación web.</li><li>Activa Authentication con correo y contraseña.</li><li>Copia sus valores reales en un archivo local <code>.env.local</code>, siguiendo <code>.env.example</code>.</li><li>Reinicia el servidor de desarrollo.</li></ol><p>La clave privada de Groq no va aquí: se configura de forma segura en Cloud Functions.</p></div> : <>
          {error && <Notice>{error}</Notice>}
          <form className="login-form" onSubmit={submit}>
            {register && <label className="field">Nombre<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" placeholder="¿Cómo te llamas?" /></label>}
            <label className="field">Correo electrónico<span className="input-icon"><Mail size={17} /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@email.com" /></span></label>
            <label className="field">Contraseña<span className="input-icon"><LockKeyhole size={17} /><input type="password" required minLength={6} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Al menos 6 caracteres" /></span></label>
            <button className="button-primary login-submit" disabled={busy}>{busy ? 'Un momento…' : register ? 'Crear cuenta' : 'Iniciar sesión'} <ArrowRight size={17} /></button>
          </form>
          <button className="login-switch" onClick={() => { setRegister(!register); setError(''); }}>{register ? '¿Ya tienes una cuenta? Inicia sesión' : '¿Primera vez por aquí? Crea tu cuenta'}</button>
        </>}
      </section>
      <p className="login-footer">Organiza · Combina · Viste mejor.</p>
    </main>
  );
}
