import { getFunctions, httpsCallable } from 'firebase/functions';
import { deleteObject, getBlob, getStorage, ref } from 'firebase/storage';
import { auth, firebaseApp } from '../firebase/client';

const maxPhotoBytes = 5 * 1024 * 1024;
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
export type VirtualReference = 'photo' | 'face' | 'mannequin' | 'result';
export type CustomTryOnMode = 'body' | 'face' | 'mannequin' | 'mannequin-face' | 'generated';

function requireSession(userId: string) {
  if (!firebaseApp || !auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Inicia sesión para utilizar el vestuario virtual.');
  }
  return firebaseApp;
}

function imageRef(userId: string, name: VirtualReference) {
  return ref(getStorage(requireSession(userId)), `users/${userId}/virtualTryOn/${name}`);
}

export async function readVirtualImage(userId: string, name: VirtualReference): Promise<Blob | null> {
  try {
    return await getBlob(imageRef(userId, name), 8 * 1024 * 1024);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'storage/object-not-found') return null;
    throw error;
  }
}

export async function saveVirtualPhoto(userId: string, photo: File): Promise<void> {
  await saveVirtualReference(userId, 'photo', photo);
}

async function encodePhoto(photo: Blob): Promise<{ data: string; mimeType: string }> {
  if (!allowedTypes.includes(photo.type) || photo.size === 0 || photo.size > maxPhotoBytes) {
    throw new Error('La fotografía debe ser JPG, PNG o WebP y pesar como máximo 5 MB.');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer la fotografía.'));
    reader.onerror = () => reject(new Error('No se pudo leer la fotografía.'));
    reader.readAsDataURL(photo);
  });
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: photo.type };
}

export async function saveVirtualReference(userId: string, kind: Exclude<VirtualReference, 'result'>, photo: File): Promise<void> {
  const app = requireSession(userId);
  const image = await encodePhoto(photo);
  const call = httpsCallable<{ data: string; mimeType: string; kind?: Exclude<VirtualReference, 'result'> }, { saved: boolean }>(
    getFunctions(app), 'saveVirtualTryOnPhoto', { timeout: 120000 },
  );
  await call({ ...image, ...(kind === 'photo' ? {} : { kind }) });
}

export async function deleteVirtualImage(userId: string, name: VirtualReference): Promise<void> {
  await deleteObject(imageRef(userId, name));
}

export async function generateVirtualImage(userId: string, garmentId: string): Promise<void> {
  const app = requireSession(userId);
  const call = httpsCallable<{ garmentId: string; consent: true }, { generated: boolean }>(
    getFunctions(app), 'generateVirtualTryOn', { timeout: 135000 },
  );
  await call({ garmentId, consent: true });
}

export async function generateCustomVirtualImage(userId: string, mode: CustomTryOnMode, garmentIds: string[], mannequinUrl?: string): Promise<void> {
  const app = requireSession(userId);
  let mannequinImage: { data: string; mimeType: string } | undefined;
  if (mannequinUrl) {
    const response = await fetch(mannequinUrl);
    if (!response.ok) throw new Error('No se pudo cargar la imagen del maniquí. Recarga la página y vuelve a intentarlo.');
    mannequinImage = await encodePhoto(await response.blob());
  }
  const call = httpsCallable<{ mode: CustomTryOnMode; garmentIds: string[]; consent: true; mannequinImage?: { data: string; mimeType: string } }, { generated: boolean }>(
    getFunctions(app), 'generateVirtualTryOn', { timeout: 135000 },
  );
  await call({ mode, garmentIds, consent: true, ...(mannequinImage ? { mannequinImage } : {}) });
}

export async function getVirtualTryOnUsage(userId: string, from: string, to: string) {
  const app = requireSession(userId);
  const call = httpsCallable<{ from: string; to: string }, {
    users: Array<{ uid: string; email: string | null; count: number }>;
    total: number;
  }>(getFunctions(app), 'getVirtualTryOnUsage');
  return (await call({ from, to })).data;
}
