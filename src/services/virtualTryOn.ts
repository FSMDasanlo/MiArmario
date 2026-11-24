import { getFunctions, httpsCallable } from 'firebase/functions';
import { deleteObject, getBlob, getStorage, ref } from 'firebase/storage';
import { auth, firebaseApp } from '../firebase/client';

const maxPhotoBytes = 5 * 1024 * 1024;
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

function requireSession(userId: string) {
  if (!firebaseApp || !auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Inicia sesión para utilizar el vestuario virtual.');
  }
  return firebaseApp;
}

function imageRef(userId: string, name: 'photo' | 'result') {
  return ref(getStorage(requireSession(userId)), `users/${userId}/virtualTryOn/${name}`);
}

export async function readVirtualImage(userId: string, name: 'photo' | 'result'): Promise<Blob | null> {
  try {
    return await getBlob(imageRef(userId, name), 8 * 1024 * 1024);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'storage/object-not-found') return null;
    throw error;
  }
}

export async function saveVirtualPhoto(userId: string, photo: File): Promise<void> {
  const app = requireSession(userId);
  if (!allowedTypes.includes(photo.type) || photo.size === 0 || photo.size > maxPhotoBytes) {
    throw new Error('La fotografía debe ser JPG, PNG o WebP y pesar como máximo 5 MB.');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer la fotografía.'));
    reader.onerror = () => reject(new Error('No se pudo leer la fotografía.'));
    reader.readAsDataURL(photo);
  });
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const call = httpsCallable<{ data: string; mimeType: string }, { saved: boolean }>(
    getFunctions(app), 'saveVirtualTryOnPhoto', { timeout: 120000 },
  );
  await call({ data, mimeType: photo.type });
}

export async function deleteVirtualImage(userId: string, name: 'photo' | 'result'): Promise<void> {
  await deleteObject(imageRef(userId, name));
}

export async function generateVirtualImage(userId: string, garmentId: string): Promise<void> {
  const app = requireSession(userId);
  const call = httpsCallable<{ garmentId: string; consent: true }, { generated: boolean }>(
    getFunctions(app), 'generateVirtualTryOn', { timeout: 135000 },
  );
  await call({ garmentId, consent: true });
}

export async function getVirtualTryOnUsage(userId: string, from: string, to: string) {
  const app = requireSession(userId);
  const call = httpsCallable<{ from: string; to: string }, {
    users: Array<{ uid: string; email: string | null; count: number }>;
    total: number;
  }>(getFunctions(app), 'getVirtualTryOnUsage');
  return (await call({ from, to })).data;
}
