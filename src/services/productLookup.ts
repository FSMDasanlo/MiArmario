export interface ProductDetails {
  name?: string;
  brand?: string;
}

export function productCode(value: string): string | null {
  const text = value.trim();
  if (text.length > 2048) return null;
  let code = text;
  if (!/^\d+$/.test(text)) {
    try {
      const url = new URL(text);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      const match = url.pathname.match(/(?:^|\/)01\/(\d{14})(?:\/|$)/);
      if (!match) return null;
      code = match[1];
    } catch {
      return null;
    }
  }
  if (![8, 12, 13, 14].includes(code.length)) return null;
  const sum = [...code.slice(0, -1)].reverse().reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0,
  );
  return (10 - sum % 10) % 10 === Number(code.at(-1)) ? code : null;
}

export async function lookupProduct(value: string): Promise<ProductDetails | null> {
  const code = productCode(value);
  if (!code) throw new Error('El código no es un EAN/UPC válido ni un QR GS1 con código de producto.');
  const url = `https://world.openproductsfacts.org/api/v3/product/${code}?fields=product_name_es,product_name,brands`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'X-User-Agent': 'MiArmario/0.1 (https://github.com/FSMDasanlo/MiArmario)' },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('No se pudo conectar con Open Products Facts. Comprueba tu conexión e inténtalo de nuevo.');
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('No se pudo consultar Open Products Facts. Inténtalo más tarde.');
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Open Products Facts devolvió una respuesta no válida.');
  }
  if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'success' || !('product' in data) || !data.product || typeof data.product !== 'object' || Array.isArray(data.product)) {
    throw new Error('Open Products Facts devolvió una respuesta no válida.');
  }
  const product = data.product as Record<string, unknown>;
  const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) || undefined : undefined;
  return {
    name: clean(product.product_name_es, 80) ?? clean(product.product_name, 80),
    brand: clean(product.brands, 60),
  };
}
