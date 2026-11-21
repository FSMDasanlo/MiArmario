import { HashRouter, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';

const AssistantPage = lazy(() => import('./pages/AssistantPage').then((module) => ({ default: module.AssistantPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const OutfitsPage = lazy(() => import('./pages/OutfitsPage').then((module) => ({ default: module.OutfitsPage })));
const WardrobePage = lazy(() => import('./pages/WardrobePage').then((module) => ({ default: module.WardrobePage })));

function PrivatePage({ children }: { children: ReactNode }) {
  return <ProtectedRoute><AppShell><Suspense fallback={<div className="loading-panel">Abriendo tu armario…</div>}>{children}</Suspense></AppShell></ProtectedRoute>;
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/acceso" element={<Suspense fallback={<div className="screen-loader">Preparando tu armario…</div>}><LoginPage /></Suspense>} />
          <Route path="/" element={<PrivatePage><DashboardPage /></PrivatePage>} />
          <Route path="/armario" element={<PrivatePage><WardrobePage /></PrivatePage>} />
          <Route path="/conjuntos" element={<PrivatePage><OutfitsPage /></PrivatePage>} />
          <Route path="/asistente" element={<PrivatePage><AssistantPage /></PrivatePage>} />
          <Route path="*" element={<PrivatePage><DashboardPage /></PrivatePage>} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
