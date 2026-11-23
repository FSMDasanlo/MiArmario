import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, firebaseApp } from '../firebase/client';
import type { GarmentCategory } from '../types';

export interface GarmentSuggestion {
  name: string | null;
  category: GarmentCategory | null;
  color: string | null;
}

export async function analyzeGarmentPhoto(photo: File): Promise<GarmentSuggestion> {
  if (!auth?.currentUser) throw new Error('Inicia sesión para analizar la fotografía.');
  if (!firebaseApp) throw new Error('Configura Firebase para analizar la fotografía.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer la fotografía.'));
    reader.onerror = () => reject(new Error('No se pudo leer la fotografía.'));
    reader.readAsDataURL(photo);
  });
  const call = httpsCallable<{ dataUrl: string }, GarmentSuggestion>(
    getFunctions(firebaseApp), 'analyzeGarmentPhoto', { timeout: 90000 },
  );
  return (await call({ dataUrl })).data;
}
