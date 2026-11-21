import { firebaseApp } from '../firebase/client';
import type { Outfit, OutfitInput } from '../types';

async function loadOutfits(userId: string) {
  if (!firebaseApp) throw new Error('Configura Firebase para gestionar conjuntos.');
  const sdk = await import('firebase/firestore/lite');
  const database = sdk.getFirestore(firebaseApp);
  return { sdk, database, collection: sdk.collection(database, 'users', userId, 'outfits') };
}

export async function listOutfits(userId: string): Promise<Outfit[]> {
  const { sdk, collection } = await loadOutfits(userId);
  const snapshot = await sdk.getDocs(collection);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Outfit);
}

export async function saveOutfit(userId: string, input: OutfitInput, outfitId?: string): Promise<void> {
  const { sdk, collection } = await loadOutfits(userId);
  const payload = {
    ...input,
    description: input.description || '',
    occasion: input.occasion || '',
    updatedAt: sdk.serverTimestamp(),
  };
  if (outfitId) {
    await sdk.updateDoc(sdk.doc(collection, outfitId), payload);
  } else {
    await sdk.addDoc(collection, { ...payload, createdAt: sdk.serverTimestamp() });
  }
}

export async function removeOutfit(userId: string, outfitId: string): Promise<void> {
  const { sdk, collection } = await loadOutfits(userId);
  await sdk.deleteDoc(sdk.doc(collection, outfitId));
}
