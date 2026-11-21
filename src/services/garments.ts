import { firebaseApp } from '../firebase/client';
import type { Garment, GarmentInput } from '../types';

async function loadFirestore() {
  if (!firebaseApp) throw new Error('Configura Firebase para gestionar prendas.');
  const sdk = await import('firebase/firestore/lite');
  return { sdk, db: sdk.getFirestore(firebaseApp) };
}

async function loadStorage() {
  if (!firebaseApp) throw new Error('Configura Firebase para gestionar fotografías.');
  const sdk = await import('firebase/storage');
  return { sdk, storage: sdk.getStorage(firebaseApp) };
}

export async function listGarments(userId: string): Promise<Garment[]> {
  const { sdk, db } = await loadFirestore();
  const snapshot = await sdk.getDocs(sdk.collection(db, 'users', userId, 'garments'));
  const hasImages = snapshot.docs.some((document) => Boolean(document.data().imagePath));
  const storageContext = hasImages ? await loadStorage() : undefined;
  return Promise.all(
    snapshot.docs.map(async (document) => {
      const data = document.data();
      const imagePath = data.imagePath as string | undefined;
      const imageUrl = imagePath && storageContext
        ? await storageContext.sdk.getDownloadURL(storageContext.sdk.ref(storageContext.storage, imagePath))
        : undefined;
      return { id: document.id, ...data, imagePath, imageUrl } as Garment;
    }),
  );
}

export async function saveGarment(
  userId: string,
  input: GarmentInput,
  garmentId?: string,
  photo?: File,
): Promise<void> {
  const { sdk, db } = await loadFirestore();
  if (photo && (!photo.type.match(/^image\/(jpeg|png|webp)$/) || photo.size > 5 * 1024 * 1024)) {
    throw new Error('La foto debe ser JPG, PNG o WebP y pesar menos de 5 MB.');
  }

  const collectionRef = sdk.collection(db, 'users', userId, 'garments');
  const itemRef = garmentId ? sdk.doc(collectionRef, garmentId) : sdk.doc(collectionRef);
  let oldImagePath: string | undefined;
  if (garmentId) {
    const snapshot = await sdk.getDoc(itemRef);
    if (!snapshot.exists()) throw new Error('No se encontró la prenda que quieres editar.');
    oldImagePath = snapshot.data()?.imagePath as string | undefined;
  }

  let imagePath = oldImagePath;
  let storageContext: Awaited<ReturnType<typeof loadStorage>> | undefined;
  if (photo) {
    storageContext = await loadStorage();
    imagePath = `users/${userId}/garments/${itemRef.id}/photo`;
    await storageContext.sdk.uploadBytes(storageContext.sdk.ref(storageContext.storage, imagePath), photo, { contentType: photo.type });
  }

  const payload = {
    ...input,
    brand: input.brand || '',
    description: input.description || '',
    ...(imagePath ? { imagePath } : {}),
    updatedAt: sdk.serverTimestamp(),
  };
  if (garmentId) {
    await sdk.updateDoc(itemRef, payload);
    if (photo && oldImagePath && oldImagePath !== imagePath && storageContext) {
      await storageContext.sdk.deleteObject(storageContext.sdk.ref(storageContext.storage, oldImagePath));
    }
  } else {
    await sdk.addDoc(collectionRef, { ...payload, createdAt: sdk.serverTimestamp() });
  }
}

export async function removeGarment(userId: string, garment: Garment): Promise<void> {
  const { sdk, db } = await loadFirestore();
  await sdk.deleteDoc(sdk.doc(db, 'users', userId, 'garments', garment.id));
  if (garment.imagePath) {
    const storageContext = await loadStorage();
    await storageContext.sdk.deleteObject(storageContext.sdk.ref(storageContext.storage, garment.imagePath));
  }
}
