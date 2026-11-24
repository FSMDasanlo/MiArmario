import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { projectID } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

const maxInputBytes = 5 * 1024 * 1024;
const maxOutputBytes = 8 * 1024 * 1024;
const options = {
  region: 'us-central1',
  cors: ['https://fsmdasanlo.github.io', 'http://localhost:5173'],
  timeoutSeconds: 120,
  memory: '512MiB' as const,
  maxInstances: 5,
};

const uploadSchema = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(1).max(Math.ceil(maxInputBytes / 3) * 4),
}).strict();

const generateSchema = z.object({
  garmentId: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/),
  consent: z.literal(true),
}).strict();

const usageSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
}).strict().refine((value) => value.from <= value.to);

function madridDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export const getVirtualTryOnUsage = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para consultar el control de pruebas.');
  if (request.auth.token.email !== 'jesus.samperruiz@gmail.com' || request.auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'No tienes permiso para consultar el control de pruebas.');
  }
  const input = usageSchema.safeParse(request.data);
  if (!input.success) throw new HttpsError('invalid-argument', 'Selecciona un intervalo de fechas válido.');

  const snapshot = await getFirestore().collection('virtualTryOnDailyUsage')
    .where('day', '>=', input.data.from).where('day', '<=', input.data.to).get();
  const users = new Map<string, { uid: string; email: string | null; count: number }>();
  for (const document of snapshot.docs) {
    const data = document.data();
    if (typeof data.uid !== 'string' || (data.email !== null && typeof data.email !== 'string')
      || !Number.isSafeInteger(data.count) || data.count < 0) {
      throw new HttpsError('internal', 'Hay un registro de uso inválido. No se puede calcular el total.');
    }
    const current = users.get(data.uid);
    if (current) {
      current.count += data.count;
      if (data.email) current.email = data.email;
    } else {
      users.set(data.uid, { uid: data.uid, email: data.email, count: data.count });
    }
  }
  const rows = [...users.values()].sort((a, b) => (a.email ?? a.uid).localeCompare(b.email ?? b.uid));
  return { users: rows, total: rows.reduce((sum, row) => sum + row.count, 0) };
});

export function validImage(bytes: Buffer, mimeType: string, maxBytes: number): boolean {
  if (!bytes.length || bytes.length > maxBytes) return false;
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

function requireUser(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Inicia sesión para utilizar el vestuario virtual.');
  return uid;
}

async function readImage(path: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const file = getStorage().bucket().file(path);
  const [metadata] = await file.getMetadata().catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 404) {
      throw new HttpsError('failed-precondition', 'No se encontró una de las fotografías. Vuelve a seleccionarla.');
    }
    throw error;
  });
  const mimeType = metadata.contentType ?? '';
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxInputBytes || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new HttpsError('failed-precondition', 'Una de las fotografías no tiene un formato o tamaño válido.');
  }
  const [bytes] = await file.download({ validation: 'crc32c' });
  if (!validImage(bytes, mimeType, maxInputBytes)) {
    throw new HttpsError('failed-precondition', 'Una de las fotografías no es una imagen válida.');
  }
  return { bytes, mimeType };
}

export const saveVirtualTryOnPhoto = onCall(options, async (request) => {
  const uid = requireUser(request.auth?.uid);
  const input = uploadSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError('invalid-argument', 'La fotografía debe ser JPG, PNG o WebP y pesar como máximo 5 MB.');
  }
  const bytes = Buffer.from(input.data.data, 'base64');
  if (bytes.toString('base64') !== input.data.data || !validImage(bytes, input.data.mimeType, maxInputBytes)) {
    throw new HttpsError('invalid-argument', 'La fotografía debe ser JPG, PNG o WebP y pesar como máximo 5 MB.');
  }
  try {
    await getStorage().bucket().file(`users/${uid}/virtualTryOn/photo`).save(bytes, {
      resumable: false,
      metadata: { contentType: input.data.mimeType, cacheControl: 'private, no-store' },
    });
  } catch {
    console.error('Virtual try-on photo save failed');
    throw new HttpsError('internal', 'No se pudo guardar la fotografía.');
  }
  return { saved: true };
});

export const generateVirtualTryOn = onCall(options, async (request) => {
  const uid = requireUser(request.auth?.uid);
  const input = generateSchema.safeParse(request.data);
  if (!input.success) throw new HttpsError('invalid-argument', 'Selecciona una prenda y acepta el envío de las fotografías.');

  const firestore = getFirestore();
  const garmentId = input.data.garmentId;
  const expectedPath = `users/${uid}/garments/${garmentId}/photo`;
  const garment = await firestore.doc(`users/${uid}/garments/${garmentId}`).get();
  if (!garment.exists || garment.data()?.imagePath !== expectedPath) {
    throw new HttpsError('failed-precondition', 'La prenda no existe o no tiene una fotografía válida.');
  }

  const lock = firestore.doc(`users/${uid}/private/virtualTryOnUsage`);
  const operationId = randomUUID();
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lock);
    if (typeof snapshot.data()?.expiresAt === 'number' && snapshot.data()!.expiresAt > Date.now()) {
      throw new HttpsError('resource-exhausted', 'Ya hay una simulación en curso. Espera antes de volver a probar.');
    }
    transaction.set(lock, { operationId, expiresAt: Date.now() + 180_000 });
  });

  try {
    const [person, clothing] = await Promise.all([
      readImage(`users/${uid}/virtualTryOn/photo`),
      readImage(expectedPath),
    ]);
    const project = projectID.value();
    if (!project) throw new HttpsError('failed-precondition', 'El servicio de simulación no está configurado.');
    const ai = new GoogleGenAI({
      vertexai: true,
      project,
      location: 'global',
      httpOptions: { apiVersion: 'v1', timeout: 90_000, retryOptions: { attempts: 1 } },
    });
    const day = madridDay(new Date());
    await firestore.collection('virtualTryOnDailyUsage').doc(`${day}_${uid}`).set({
      day, uid, email: request.auth?.token.email ?? null, count: FieldValue.increment(1),
    }, { merge: true });
    const response = await ai.models.generateContent({
      model: 'gemini-nano-banana-2.1',
      contents: [{
        role: 'user',
        parts: [
          { text: 'Genera una única fotografía realista. La primera imagen muestra a la persona y la segunda muestra la prenda. Viste a la persona de la primera imagen con la prenda de la segunda. Conserva su rostro, cabello, postura, proporciones, fondo e iluminación. Reproduce fielmente el color, estampado, diseño y detalles visibles de la prenda. No cambies otras prendas ni añadas accesorios.' },
          { inlineData: { mimeType: person.mimeType, data: person.bytes.toString('base64') } },
          { inlineData: { mimeType: clothing.mimeType, data: clothing.bytes.toString('base64') } },
        ],
      }],
      config: {
        candidateCount: 1,
        responseModalities: ['IMAGE'],
        imageConfig: { imageSize: '1K', aspectRatio: '3:4' },
      },
    });
    const images = (response.candidates ?? [])
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .filter((part) => part.inlineData?.mimeType?.startsWith('image/'))
      .map((part) => part.inlineData!);
    if (images.length !== 1 || !images[0].data || !images[0].mimeType) {
      throw new HttpsError('internal', 'La IA no devolvió exactamente una imagen. Prueba de nuevo cuando quieras.');
    }
    const output = Buffer.from(images[0].data, 'base64');
    if (!validImage(output, images[0].mimeType, maxOutputBytes)) {
      throw new HttpsError('internal', 'La IA devolvió una imagen no válida.');
    }
    await getStorage().bucket().file(`users/${uid}/virtualTryOn/result`).save(output, {
      resumable: false,
      metadata: { contentType: images[0].mimeType, cacheControl: 'private, no-store' },
    });
    return { generated: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Virtual try-on request failed');
    throw new HttpsError('unavailable', 'No se pudo generar la simulación. Comprueba las fotografías y vuelve a intentarlo más tarde.');
  } finally {
    try {
      await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lock);
        if (snapshot.data()?.operationId === operationId) transaction.delete(lock);
      });
    } catch {
      console.error('Virtual try-on lock release failed');
    }
  }
});
