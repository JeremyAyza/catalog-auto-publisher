/**
 * Lee el país de origen desde brand.json en la raíz de la carpeta elegida
 * (el mismo archivo que usan los scripts de Node). Devuelve null si no existe o no trae "country".
 */
export async function readBrandCountry(rootHandle: any): Promise<string | null> {
  try {
    const fileHandle = await rootHandle.getFileHandle('brand.json');
    const file = await fileHandle.getFile();
    const brand = JSON.parse(await file.text());
    return typeof brand?.country === 'string' && brand.country.trim() ? brand.country.trim() : null;
  } catch {
    return null;
  }
}
