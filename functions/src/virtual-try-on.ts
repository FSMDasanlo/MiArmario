import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { projectID } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

const maxInputBytes = 5 * 1024 * 1024;
const maxOutputBytes = 8 * 1024 * 1024;
const maxGarments = 6;
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
  kind: z.enum(['photo', 'face', 'mannequin']).optional(),
}).strict();

const generateSchema = z.object({
  garmentId: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/),
  consent: z.literal(true),
}).strict();

const customGenerateSchema = z.object({
  mode: z.enum(['body', 'face', 'mannequin', 'mannequin-face', 'generated']),
  garmentIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,150}$/)).min(1).max(maxGarments)
    .refine((ids) => new Set(ids).size === ids.length),
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
    const imageName = input.data.kind ?? 'photo';
    await getStorage().bucket().file(`users/${uid}/virtualTryOn/${imageName}`).save(bytes, {
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
  const legacyInput = generateSchema.safeParse(request.data);
  let mode: 'photo' | z.infer<typeof customGenerateSchema>['mode'];
  let garmentIds: string[];
  if (legacyInput.success) {
    mode = 'photo';
    garmentIds = [legacyInput.data.garmentId];
  } else {
    const customInput = customGenerateSchema.safeParse(request.data);
    if (!customInput.success) {
      throw new HttpsError('invalid-argument', 'Selecciona al menos una prenda y acepta el envío de las fotografías.');
    }
    mode = customInput.data.mode;
    garmentIds = customInput.data.garmentIds;
  }

  const firestore = getFirestore();
  const garmentPaths = await Promise.all(garmentIds.map(async (garmentId) => {
    const expectedPath = `users/${uid}/garments/${garmentId}/photo`;
    const garment = await firestore.doc(`users/${uid}/garments/${garmentId}`).get();
    if (!garment.exists || garment.data()?.imagePath !== expectedPath) {
      throw new HttpsError('failed-precondition', 'Una de las prendas no existe o no tiene una fotografía válida.');
    }
    return expectedPath;
  }));
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
    const referenceNames = mode === 'photo' || mode === 'body' ? ['photo']
      : mode === 'face' ? ['face']
        : mode === 'mannequin' ? ['mannequin']
          : mode === 'mannequin-face' ? ['face', 'mannequin'] : [];
    const [references, garments] = await Promise.all([
      Promise.all(referenceNames.map((name) => readImage(`users/${uid}/virtualTryOn/${name}`))),
      Promise.all(garmentPaths.map(readImage)),
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
    const legacyPrompt = 'Genera una única fotografía realista. La primera imagen muestra a la persona y la segunda muestra la prenda. Viste a la persona de la primera imagen con la prenda de la segunda. Conserva su rostro, cabello, postura, proporciones, fondo e iluminación. Reproduce fielmente el color, estampado, diseño y detalles visibles de la prenda. No cambies otras prendas ni añadas accesorios.';
    const customPrompts = {
      body: 'Genera una única fotografía realista. La primera imagen muestra a la persona y las siguientes imágenes muestran las prendas numeradas. Viste a la persona de la primera imagen con todas las prendas, formando un conjunto coherente. Conserva su rostro, cabello, postura, proporciones, fondo e iluminación. Reproduce fielmente el color, estampado, diseño y detalles visibles de cada prenda.',
      face: 'Genera una única fotografía fotorrealista de cuerpo entero. La primera imagen es la referencia de identidad facial: conserva fielmente sus rasgos, edad aparente, tono de piel y cabello; no embellezcas ni sustituyas la identidad. No hay referencia corporal: crea un cuerpo humano, postura y entorno naturales. Las imágenes siguientes son prendas de referencia; viste al modelo con todas ellas como un conjunto coherente.',
      mannequin: 'Genera una única fotografía fotorrealista del mismo maniquí de la primera imagen, vestido con las prendas de referencia que aparecen después. Conserva estrictamente las proporciones, postura, orientación, encuadre y características del maniquí. No lo conviertas en una persona ni alteres su cuerpo.',
      'mannequin-face': 'Genera una única fotografía fotorrealista usando como primera imagen la referencia de identidad facial y como segunda imagen el maniquí corporal. Conserva fielmente la identidad y los rasgos del rostro de la primera imagen e intégralo de forma natural en la cabeza del maniquí. Conserva estrictamente las proporciones, postura, orientación y encuadre del maniquí. Las imágenes siguientes son las prendas que debe vestir.',
      generated: 'Genera una única fotografía fotorrealista de un modelo humano adulto, con cuerpo, postura y entorno naturales elegidos libremente. Las imágenes siguientes son prendas de referencia: viste al modelo con todas ellas como un conjunto coherente.',
    } as const;
    const prompt = mode === 'photo' ? legacyPrompt : customPrompts[mode];
    const fullPrompt = legacyInput.success
      ? [
        { text: legacyPrompt },
        { inlineData: { mimeType: references[0]!.mimeType, data: references[0]!.bytes.toString('base64') } },
        { inlineData: { mimeType: garments[0]!.mimeType, data: garments[0]!.bytes.toString('base64') } },
      ]
      : [
        { text: prompt },
        ...references.flatMap((image, index) => [
          { text: `Referencia ${index + 1} (${referenceNames[index]}):` },
          { inlineData: { mimeType: image.mimeType, data: image.bytes.toString('base64') } },
        ]),
        ...garments.flatMap((image, index) => [
          { text: `Prenda ${index + 1}:` },
          { inlineData: { mimeType: image.mimeType, data: image.bytes.toString('base64') } },
        ]),
        { text: 'Prioriza la fidelidad exacta a cada prenda: conserva sus colores, estampados, diseño, tejido y detalles visibles; no inventes, sustituyas, omitas ni combines diseños entre prendas. Adapta cada prenda de forma realista al cuerpo. El resultado debe parecer una sola fotografía, nunca un collage. No añadas accesorios ni prendas que no estén en las referencias.' },
      ];
    const response = await ai.models.generateContent({
      model: 'gemini-nano-banana-2.1',
      contents: [{
        role: 'user',
        parts: fullPrompt,
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
