import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { firebaseConfigured } from '../firebase/client';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="screen-loader">Preparando tu armario…</div>;
  if (firebaseConfigured && !user) {
    return <Navigate to="/acceso" replace state={{ from: location.pathname }} />;
  }
  return children;
}
