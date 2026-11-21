import type { Timestamp } from 'firebase/firestore';

export const garmentCategories = [
  'camisetas',
  'camisas',
  'pantalones',
  'vestidos',
  'chaquetas',
  'abrigos',
  'calzado',
  'complementos',
] as const;

export type GarmentCategory = (typeof garmentCategories)[number];
export type Season = 'primavera' | 'verano' | 'otoño' | 'invierno' | 'todo el año';
export type ClothingStyle = 'casual' | 'formal' | 'deportivo' | 'minimalista' | 'clásico' | 'urbano';

export interface Garment {
  id: string;
  category: GarmentCategory;
  name: string;
  color: string;
  brand?: string;
  season: Season[];
  style: ClothingStyle[];
  description?: string;
  imagePath?: string;
  imageUrl?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface GarmentInput {
  category: GarmentCategory;
  name: string;
  color: string;
  brand?: string;
  season: Season[];
  style: ClothingStyle[];
  description?: string;
}

export interface Outfit {
  id: string;
  name: string;
  garmentIds: string[];
  description?: string;
  occasion?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface OutfitInput {
  name: string;
  garmentIds: string[];
  description?: string;
  occasion?: string;
}
