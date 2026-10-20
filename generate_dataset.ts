import fs from 'fs-extra';
import path from 'path';
import { OpenAI } from 'openai';
import sharp from 'sharp';
import { CATEGORIES } from './const';
import { getTimestamp } from './utils';
import { DatasetItem } from './types';
import { loadBrand, buildSystemPrompt, buildGenericClosing, buildMarketplaceDescription, buildInstagramDescription } from './brand';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// --- CONFIGURACIÓN ---
const CONFIG = {
	OPENAI_API_KEY: process.env.OPENAI_API_KEY,
	PARENT_FOLDER: process.env.PARENT_FOLDER || 'productos',
};

if (!CONFIG.OPENAI_API_KEY) {
	console.error('❌ Falta OPENAI_API_KEY en .env');
	process.exit(1);
}

const BRAND = loadBrand();

const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
const ROOT_PATH = path.isAbsolute(CONFIG.PARENT_FOLDER) ? CONFIG.PARENT_FOLDER : path.join(__dirname, CONFIG.PARENT_FOLDER);

// Aseguramos que la carpeta datasets exista
const DATASET_DIR = path.join(__dirname, 'datasets');
if (!fs.existsSync(DATASET_DIR)) fs.mkdirSync(DATASET_DIR);

/**
 * Resuelve el nombre del archivo de salida.
 * Prioridad: DATASET_FILE explícito > nombre derivado de PARENT_FOLDER (ej. productos/mi-marca/04 -> dataset_mi-marca_04.json) > timestamp.
 * Así el dataset persiste entre corridas de la misma colección y el dedupe de más abajo funciona.
 */
function resolveOutputFileName(): string {
	if (process.env.DATASET_FILE) {
		return process.env.DATASET_FILE.endsWith('.json') ? process.env.DATASET_FILE : `${process.env.DATASET_FILE}.json`;
	}
	const parts = CONFIG.PARENT_FOLDER.split(/[\\/]/).filter(p => p && p.toLowerCase() !== 'productos');
	if (parts.length > 0) return `dataset_${parts.join('_')}.json`;
	return `dataset_${getTimestamp()}.json`;
}
const OUTPUT_FILE = path.join(DATASET_DIR, resolveOutputFileName());

// --- GESTIÓN DE ESTADO ---
let dataset: DatasetItem[] = [];
if (fs.existsSync(OUTPUT_FILE)) {
	try {
		dataset = fs.readJsonSync(OUTPUT_FILE);
	} catch (e) {
		dataset = [];
	}
}

/**
 * Optimiza la imagen para IA
 */
async function getOptimizedBase64(imagePath: string): Promise<string | null> {
	try {
		const metadata = await sharp(imagePath).metadata();
		let pipeline = sharp(imagePath);
		if (metadata.width && metadata.height && (metadata.width > 2000 || metadata.height > 2000)) {
			pipeline = pipeline.resize(1080, 1080, { fit: 'inside' });
		}
		const buffer = await pipeline.jpeg({ quality: 80 }).toBuffer();
		return buffer.toString('base64');
	} catch (error: any) {
		console.error(`❌ Error optimizando: ${imagePath}`, error.message);
		return null;
	}
}

interface IAAnalysisResult {
	code: string;
	comercial_name: string;
	titulo_premium: string;
	description_marketplace: string;
	description_premium: string;
	category: string;
	brand: string | null;
	tags: string[];
	description_instagram?: string;
	short_descripcion?: string;
}

async function analyzeWithIA(imagePath: string, retries = 2): Promise<IAAnalysisResult | null> {
	try {
		const base64Image = await getOptimizedBase64(imagePath);
		if (!base64Image) return null;

		const systemPrompt = buildSystemPrompt(BRAND);

		let userPrompt = '';
		if (BRAND.style === 'fashion') {
			userPrompt = `
    Analiza esta imagen de ropa/moda y genera un objeto JSON con los siguientes campos:
    
    1. "code": Genera un slug basado en el nombre comercial (ej: "vestido_midi_noir").
    2. "comercial_name": Nombre claro y elegante del producto en español.
    3. "titulo_premium": Usa directamente el "comercial_name" de arriba.
    4. "description_marketplace": Crea un copy persuasivo de 2 partes separadas por doble salto de línea (\\n\\n):
       - Parte 1 (Hook/Intro): Un gancho corto y atractivo de 1 a 2 líneas sobre la prenda (ej: "¿La pieza que define tu elegancia este verano?").
       - Parte 2: La sección "🌸 Te encantará porque:" seguida de entre 2 y 4 puntos/viñetas que inicien obligatoriamente con el emoji "🔹" detallando beneficios concretos observados en la foto (ej:
         🌸 Te encantará porque:
         🔹 Diseño largo con botones frontales para un look elegante
         🔹 Blanco impoluto que eleva cualquier outfit
         🔹 Tejido premium suave y cálido para todas las estaciones
         🔹 Corte versátil que combina con jeans o vestidos)
    5. "description_premium": Resumen de beneficios de 200 caracteres.
    6. "category": Selecciona la mejor opción de esta lista: [${CATEGORIES.join(", ")}].
    7. "brand": "${BRAND.name}".
    8. "tags": Array de 3 palabras clave simples.
    9. "description_instagram": Como Copywriter de Moda de Lujo y Growth Hacker de Instagram, genera una descripción creativa y estética para la prenda estructurada en 3 secciones separadas por doble salto de línea (\\n\\n):
       - Sección 1 (Hook/Scroll-stopper): Una frase corta y atractiva con emojis elegantes que llame la atención de inmediato en el feed.
       - Sección 2 (Párrafo Emocional): Un párrafo de 2-3 líneas de tono aspiracional. Debe conectar con la audiencia sobre cómo se siente usar la prenda, su textura, fluidez o vibra (ej: 'Siente la libertad en cada movimiento con nuestra viscosa premium...').
       - Sección 3: Un título '🌸 Te encantará porque:' seguido de 2 a 3 viñetas que comiencen obligatoriamente con el emoji '✨' detallando aspectos visuales o sensaciones de uso de forma poética y refinada.
    10. "short_descripcion": Una descripción corta de 1 a 2 líneas (máx 200 caracteres) con tono aspiracional y 1-2 emojis, pensada para el campo "Descripción (opcional)" del catálogo de WhatsApp Business.

    Esquema de salida esperado:
    {
      "code": "string",
      "comercial_name": "string",
      "titulo_premium": "string",
      "description_marketplace": "string",
      "description_premium": "string",
      "category": "string",
      "brand": "string|null",
      "tags": ["string"],
      "description_instagram": "string",
      "short_descripcion": "string"
    }`;
		} else {
			userPrompt = `
    Analiza esta imagen y genera un objeto JSON con los siguientes campos:
    
    1. "code": Genera un slug basado en el nombre comercial (ej: "mesa_madera_vintage").
    2. "comercial_name": Nombre claro del producto.
    3. "titulo_premium": Título de alto impacto para Marketplace (Max 60 caracteres).
    4. "description_marketplace": Crea un copy profesional de 3 bloques separados por doble salto de línea (\\n\\n). 
       - Bloque 1: Saludo y gancho.
       - Bloque 2: Características clave (6 líneas max).
       - Bloque 3: Cierre exacto: "${buildGenericClosing(BRAND)}".
       - IMPORTANTE: No incluyas palabras como "BLOQUE" o "DETALLES".
    5. "description_premium": Resumen de beneficios de 200 caracteres.
    6. "category": Selecciona la mejor opción de esta lista: [${CATEGORIES.join(", ")}].
    7. "brand": Nombre de marca si es visible, si no, null.
    8. "tags": Array de 3 palabras clave simples.
    9. "description_instagram": Una descripción corta, atractiva y orientada a redes sociales para el producto (de 2 a 3 líneas).
    
    Esquema de salida esperado:
    {
      "code": "string",
      "comercial_name": "string",
      "titulo_premium": "string",
      "description_marketplace": "string",
      "description_premium": "string",
      "category": "string",
      "brand": "string|null",
      "tags": ["string"],
      "description_instagram": "string"
    }`;
		}

		const response = await openai.chat.completions.create({
			model: "gpt-4o",
			messages: [
				{ role: "system", content: systemPrompt },
				{
					role: "user",
					content: [
						{ type: "text", text: userPrompt },
						{ type: "image_url", image_url: { "url": `data:image/jpeg;base64,${base64Image}` } }
					]
				}
			],
			response_format: { type: "json_object" },
			temperature: 0.5
		});

		// The response content might be null, though unlikely with this structure. Handling it safely.
		const content = response.choices[0].message.content;
		if (!content) return null;

		return JSON.parse(content) as IAAnalysisResult;
	} catch (error: any) {
		console.error(error)
		if (error.status === 429 && retries > 0) {
			console.log(`⏳ Rate Limit. Reintentando en 30s...`);
			await new Promise(res => setTimeout(res, 30000));
			return analyzeWithIA(imagePath, retries - 1);
		}
		return null;
	}
}

async function start() {
	if (!fs.existsSync(ROOT_PATH)) return console.error(`Ruta de imágenes no encontrada: ${ROOT_PATH}`);

	const entries = fs.readdirSync(ROOT_PATH);
	const productsToProcess: {
		code: string;
		mainImageFullPath: string;
		mainImageRelativePath: string;
		galleryRelativePaths: string[];
	}[] = [];

	for (const entry of entries) {
		const fullEntryPath = path.join(ROOT_PATH, entry);
		const stat = fs.statSync(fullEntryPath);

		if (stat.isDirectory()) {
			// Es una carpeta de producto (puede contener múltiples imágenes)
			const files = fs.readdirSync(fullEntryPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
			if (files.length === 0) continue;

			// Ordenar los archivos alfabéticamente para consistencia
			files.sort();

			const mainImageFullPath = path.join(fullEntryPath, files[0]);
			const mainImageRelativePath = path.relative(__dirname, mainImageFullPath);
			const galleryRelativePaths = files.map(f => path.relative(__dirname, path.join(fullEntryPath, f)));
			const code = entry.replace(/-/g, '_');

			// Evitar procesar si la ruta principal ya existe en el dataset existente
			if (dataset.some(item => item.relative_path === mainImageRelativePath)) {
				console.log(`⏩ Saltando carpeta: ${entry} (ya procesada)`);
				continue;
			}

			productsToProcess.push({
				code,
				mainImageFullPath,
				mainImageRelativePath,
				galleryRelativePaths
			});
		} else if (stat.isFile() && /\.(jpg|jpeg|png)$/i.test(entry)) {
			// Es una imagen individual en la raíz
			const mainImageRelativePath = path.relative(__dirname, fullEntryPath);
			const code = path.basename(entry, path.extname(entry)).replace(/-/g, '_');

			if (dataset.some(item => item.relative_path === mainImageRelativePath)) {
				console.log(`⏩ Saltando imagen: ${entry} (ya procesada)`);
				continue;
			}

			productsToProcess.push({
				code,
				mainImageFullPath: fullEntryPath,
				mainImageRelativePath,
				galleryRelativePaths: [mainImageRelativePath]
			});
		}
	}

	console.log(`📦 Encontrados ${productsToProcess.length} productos para procesar.`);

	for (const product of productsToProcess) {
		console.log(`🔍 Analizando: ${product.code}...`);
		const iaInfo = await analyzeWithIA(product.mainImageFullPath);

		if (!iaInfo) {
			console.error(`❌ Error al analizar: ${product.code}`);
			continue;
		}

		let description_marketplace = iaInfo.description_marketplace;
		let titulo_premium = iaInfo.titulo_premium;
		let description_instagram: string | undefined = undefined;

		// En el estilo "fashion" se agrega el pie fijo de la marca y una descripción propia para Instagram
		if (BRAND.style === 'fashion') {
			titulo_premium = iaInfo.comercial_name;
			description_marketplace = buildMarketplaceDescription(description_marketplace, BRAND);
			description_instagram = buildInstagramDescription(iaInfo.description_instagram || '', iaInfo.tags, BRAND);
		}

		const newProduct: DatasetItem = {
			code: product.code,
			relative_path: product.mainImageRelativePath,
			titulo_premium: titulo_premium,
			description_marketplace: description_marketplace,
			category: iaInfo.category,
			published: {
				facebook: false,
				instagram: false,
				whatsapp: false
			},
			price: 0,
			price_offer: 0,
			comercial_name: iaInfo.comercial_name,
			description_premium: iaInfo.description_premium,
			brand: iaInfo.brand || (BRAND.style === 'fashion' ? BRAND.name : null),
			tags: iaInfo.tags,
			createdAt: new Date().toISOString(),
			gallery_images: product.galleryRelativePaths,
			description_instagram: description_instagram,
			short_descripcion: iaInfo.short_descripcion
		};

		dataset.push(newProduct);
		fs.writeJsonSync(OUTPUT_FILE, dataset, { spaces: 2 });
		console.log(`✅ Añadido al dataset: ${newProduct.comercial_name}`);

		await new Promise(res => setTimeout(res, 2000));
	}

	console.log(`\n🎉 Proceso finalizado. Dataset en: ${OUTPUT_FILE}`);
}

start();
