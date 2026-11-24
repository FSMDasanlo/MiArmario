import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
  CalendarDays,
  ChevronDown,
  Layers3,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Shirt,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { auth, firebaseConfigured } from '../firebase/client';
import { logoUrl } from '../brand';

const navigation = [
  { to: '/', label: 'Resumen', icon: Layers3, end: true },
  { to: '/armario', label: 'Mi armario', icon: Shirt },
  { to: '/conjuntos', label: 'Conjuntos', icon: CalendarDays },
  { to: '/asistente', label: 'Estilista IA', icon: Sparkles },
  { to: '/vestuario-virtual', label: 'Vestuario Virtual', icon: UserRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    if (auth) await signOut(auth);
    navigate('/acceso');
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <img src={logoUrl} alt="MiArmario" />
          <button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>
        <p className="sidebar-caption">TU ESPACIO PERSONAL</p>
        <nav className="side-nav" aria-label="Navegación principal">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {label === 'Estilista IA' && <span className="nav-new">IA</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {user ? (
            <button className="account-row" onClick={handleSignOut}>
              <span className="avatar">{(user.displayName || user.email || 'M').slice(0, 1).toUpperCase()}</span>
              <span className="account-copy"><strong>{user.displayName || 'Mi cuenta'}</strong><small>{user.email}</small></span>
              <LogOut size={17} />
            </button>
          ) : (
            <button className="account-row" onClick={() => navigate('/acceso')}>
              <span className="avatar">M</span>
              <span className="account-copy"><strong>Tu cuenta</strong><small>Inicia sesión</small></span>
              <ChevronDown size={17} />
            </button>
          )}
        </div>
      </aside>

      {menuOpen && <button className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}

      <div className="main-column">
        <header className="topbar">
          <button className="icon-button menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={21} /></button>
          <div className="topbar-crumb"><strong>MiArmario</strong></div>
          <div className="topbar-actions">
            <span className="topbar-greeting">Hola{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</span>
            <button className="topbar-avatar" onClick={() => user ? void handleSignOut() : navigate('/acceso')} aria-label={user ? 'Cerrar sesión' : 'Iniciar sesión'}>
              {user ? (user.displayName || user.email || 'M').slice(0, 1).toUpperCase() : 'M'}
            </button>
          </div>
        </header>
        <main className="page-content">
          {!firebaseConfigured && (
            <div className="setup-notice">
              <span className="setup-dot" />
              <p><strong>Configuración pendiente.</strong> Conecta Firebase para guardar prendas y activar tu cuenta.</p>
              <button onClick={() => navigate('/acceso')}>Ver pasos <ChevronDown size={15} /></button>
            </div>
          )}
          {children}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} aria-label={label} className={({ isActive }) => `mobile-nav-link ${isActive ? 'mobile-nav-active' : ''}`}>
            <Icon size={20} />
            <span>{label === 'Estilista IA' ? 'Estilista' : label === 'Vestuario Virtual' ? 'Vestuario' : label}</span>
          </NavLink>
        ))}
        <button className="mobile-nav-link" onClick={() => setMenuOpen(true)} aria-label="Más opciones"><Menu size={20} /><span>Más</span></button>
      </nav>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PrimaryButton({ children, onClick, icon = <Plus size={18} />, disabled = false }: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return <button className="button-primary" onClick={onClick} disabled={disabled}>{icon}{children}</button>;
}

export function EmptyState({ icon, title, body, action }: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'info' }) {
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function MobileAddButton({ onClick }: { onClick: () => void }) {
  return <button className="mobile-add-fab" onClick={onClick} aria-label="Añadir prenda"><Plus size={22} /></button>;
}

export function AssistantLink() {
  return <NavLink to="/asistente" className="assistant-link"><MessageCircle size={16} /> Pregunta a tu estilista</NavLink>;
}
