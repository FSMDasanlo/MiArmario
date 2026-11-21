import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, firebaseApp } from '../firebase/client';

export interface AssistantRequest {
  question: string;
  occasion?: string;
  weather?: string;
  season?: string;
  style?: string;
}

export interface AssistantResponse {
  answer: string;
  recommendations: Array<{ name: string; garmentIds: string[]; reasoning: string }>;
}

export async function askWardrobeAssistant(input: AssistantRequest): Promise<AssistantResponse> {
  if (!auth?.currentUser) throw new Error('Inicia sesión para consultar tu armario.');
  if (!firebaseApp) throw new Error('Configura Firebase para consultar el asistente.');
  const call = httpsCallable<AssistantRequest, AssistantResponse>(getFunctions(firebaseApp), 'recommendOutfit');
  const result = await call(input);
  return result.data;
}
