import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';

const imageSchema = z.object({
  dataUrl: z.string().max(7_000_100),
}).strict();

export function validateImage(input: unknown): string {
  const parsed = imageSchema.safeParse(input);
  const match = parsed.success && parsed.data.dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new HttpsError('invalid-argument', 'La fotografía debe ser JPG, PNG o WebP y pesar hasta 5 MB.');
  const bytes = Buffer.from(match[2], 'base64');
  const validHeader = match[1] === 'jpeg'
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : match[1] === 'png'
      ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!validHeader || bytes.length > 5 * 1024 * 1024 || bytes.toString('base64') !== match[2]) {
    throw new HttpsError('invalid-argument', 'La fotografía debe ser JPG, PNG o WebP y pesar hasta 5 MB.');
  }
  return parsed.data.dataUrl;
}

const suggestionSchema = z.object({
  name: z.string().trim().min(1).max(80).nullable(),
  category: z.enum(['camisetas', 'camisas', 'pantalones', 'vestidos', 'chaquetas', 'abrigos', 'calzado', 'complementos']).nullable(),
  color: z.string().trim().min(1).max(40).nullable(),
}).strict();

export function parseSuggestion(content: string) {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new HttpsError('internal', 'El análisis devolvió una respuesta no válida.');
  }
  const result = suggestionSchema.safeParse(data);
  if (!result.success) throw new HttpsError('internal', 'El análisis devolvió una respuesta no válida.');
  return result.data;
}
