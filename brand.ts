import fs from 'fs-extra';
import path from 'path';

/**
 * Datos de la marca que firman cada publicación. Viven en brand.json (no versionado);
 * brand.example.json muestra el formato.
 *
 * style:
 *  - "fashion": prompt de moda, pie fijo con tallas/contacto/redes y descripción propia para Instagram.
 *  - "generic": prompt genérico con un cierre de una línea.
 */
export interface BrandConfig {
	name: string;
	style: 'fashion' | 'generic';
	country: string;
	whatsapp: string;
	instagram?: string;
	facebook?: string;
	sizesLine?: string;
	shippingLine: string;
	instagramClosing?: string;
	hashtags?: string;
}

const REQUIRED: (keyof BrandConfig)[] = ['name', 'style', 'country', 'whatsapp', 'shippingLine'];

export function loadBrand(filePath: string = process.env.BRAND_FILE || 'brand.json'): BrandConfig {
	const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
	if (!fs.existsSync(fullPath)) {
		throw new Error(`❌ No se encontró ${filePath}. Copia brand.example.json a brand.json y completa los datos de tu marca.`);
	}
	return parseBrand(fs.readJsonSync(fullPath));
}

export function parseBrand(raw: any): BrandConfig {
	const missing = REQUIRED.filter(key => !raw?.[key]);
	if (missing.length > 0) {
		throw new Error(`❌ Faltan campos en brand.json: ${missing.join(', ')}`);
	}
	if (raw.style !== 'fashion' && raw.style !== 'generic') {
		throw new Error(`❌ brand.json: "style" debe ser "fashion" o "generic"`);
	}
	return raw as BrandConfig;
}

const KEYCAPS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

/** "900 111 222" -> "9️⃣0️⃣0️⃣ 1️⃣1️⃣1️⃣ 2️⃣2️⃣2️⃣" (los espacios se conservan) */
export function toKeycapDigits(phone: string): string {
	return phone.replace(/\d/g, d => KEYCAPS[Number(d)]);
}

export function buildSystemPrompt(brand: BrandConfig): string {
	return `Eres un experto en Growth Hacking y SEO para Marketplace en ${brand.country}.
    Tu salida DEBE SER SIEMPRE un JSON que cumpla estrictamente con el esquema definido.`;
}

/** Cierre que el modelo debe copiar tal cual en el estilo "generic". */
export function buildGenericClosing(brand: BrandConfig): string {
	return `${brand.name}. ${brand.shippingLine}. Pedidos al WhatsApp: ${toKeycapDigits(brand.whatsapp)}`;
}

/** Pie fijo que se agrega a la descripción de Marketplace en el estilo "fashion". */
export function buildMarketplaceFooter(brand: BrandConfig): string {
	const phone = toKeycapDigits(brand.whatsapp);
	const lines: string[] = [];
	if (brand.sizesLine) lines.push(`${brand.sizesLine}\n`);
	lines.push(`📩 Haz tu pedido por DM o vía WhatsApp`);
	lines.push(`📱 ${phone}`);
	lines.push(brand.shippingLine);
	lines.push(`📲 Conecta con tu estilo más vibrante:\n`);
	lines.push(`📸 Más modelos en:`);
	if (brand.instagram) lines.push(`👉 Instagram: ${brand.instagram}`);
	if (brand.facebook) lines.push(`👉 Facebook: ${brand.facebook}`);
	lines.push(`📱 ${phone}`);
	return lines.join('\n');
}

export function buildMarketplaceDescription(aiDescription: string, brand: BrandConfig): string {
	const withFooter = `${aiDescription}\n\n${buildMarketplaceFooter(brand)}`;
	return normalizeNewlines(withFooter);
}

export function buildInstagramDescription(aiDescription: string, tags: string[] | undefined, brand: BrandConfig): string {
	const hashtags = tags && tags.length > 0
		? tags.map(t => `#${t.trim().replace(/\s+/g, '')}`).join(' ')
		: '';
	const closing = brand.instagramClosing ? `${brand.instagramClosing}\n\n` : '';
	return (
		`${normalizeNewlines(aiDescription || '')}\n\n` +
		closing +
		`${hashtags} ${brand.hashtags || ''}`.trim()
	);
}

function normalizeNewlines(text: string): string {
	return text.replace(/\\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}
