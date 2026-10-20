import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs-extra';
import { humanDelay, normalizePath, sleep, resolveDatasetPath } from './utils';
import sharp from 'sharp';
import { DatasetItem } from './types';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

chromium.use(stealthPlugin());

const SESSION_PATH = path.join(process.cwd(), 'fb_session');
const ERRORS_DIR = path.join(process.cwd(), 'errors');
const TEMP_UPLOADS_DIR = path.join(process.cwd(), '.temp_uploads');
const MAX_IMAGE_SIZE_BYTES = 12 * 1024 * 1024; // 12MB (Límite Instagram Web ~15MB)

// Asegurar existencia de carpetas auxiliares
fs.ensureDirSync(ERRORS_DIR);
fs.ensureDirSync(TEMP_UPLOADS_DIR);

/**
 * Optimiza imagen sólo si excede 12MB, usando calidad alta (Q95) y resolución intacta.
 */
async function prepareImageForInstagram(filePath: string): Promise<string> {
	try {
		const stat = await fs.stat(filePath);
		if (stat.size <= MAX_IMAGE_SIZE_BYTES) {
			return filePath;
		}

		console.log(`⚠️ Imagen pesada (${(stat.size / 1024 / 1024).toFixed(2)} MB): ${path.basename(filePath)}. Optimizando con calidad Q95 (sin tocar resolución)...`);
		await fs.ensureDir(TEMP_UPLOADS_DIR);
		const parsed = path.parse(filePath);
		const tempOutPath = path.join(TEMP_UPLOADS_DIR, `${parsed.name}_opt_${Date.now()}.jpg`);

		await sharp(filePath)
			.jpeg({ quality: 95, mozjpeg: true })
			.toFile(tempOutPath);

		const newStat = await fs.stat(tempOutPath);
		console.log(`✅ Imagen optimizada: ${(newStat.size / 1024 / 1024).toFixed(2)} MB -> ${path.basename(tempOutPath)}`);
		return tempOutPath;
	} catch (err: any) {
		console.warn(`⚠️ No se pudo optimizar imagen ${filePath}: ${err.message}. Usando original.`);
		return filePath;
	}
}

async function run() {
	const datasetPath = resolveDatasetPath();
	console.log(`📂 Loaded dataset: ${datasetPath}`);

	const dataset: DatasetItem[] = fs.readJsonSync(datasetPath);
	
	// Abrir navegador con sesión compartida de Facebook/Instagram
	const context = await chromium.launchPersistentContext(SESSION_PATH, {
		headless: false,
		args: ['--start-maximized'],
		viewport: null
	});

	const page = await context.newPage();

	try {
		for (const [index, item] of dataset.entries()) {
			// Comprobar si ya está publicado en Instagram
			const isIgPublished = typeof item.published === 'object' && item.published !== null
				? item.published.instagram
				: false;

			if (isIgPublished) {
				console.log(`⏭️ Skipping published item: ${item.code} (already on Instagram)`);
				continue;
			}

			if (!item.description_instagram) {
				console.warn(`⚠️ Omitiendo ${item.code} porque no tiene 'description_instagram' configurada.`);
				continue;
			}

			console.log(`🚀 Processing Instagram Post: ${item.code} - ${item.titulo_premium || 'Sin título'}`);

			// Ir a Instagram
			await page.goto('https://www.instagram.com/');
			await sleep(humanDelay(3000, 5000));

			// Comprobar si aparece el botón rápido de inicio de sesión "Continuar" (asociado a la sesión de Facebook)
			const continueBtn = page.getByRole('button', { name: 'Continuar', exact: false }).first();
			if (await continueBtn.isVisible()) {
				console.log('🔗 Detectado botón rápido de inicio de sesión "Continuar". Haciendo clic...');
				await continueBtn.click();
				await sleep(humanDelay(4000, 6000));
			}

			// Validar si requiere inicio de sesión
			const usernameInput = page.locator('input[name="username"]').first();
			if (await usernameInput.isVisible()) {
				console.log('⚠️ Sesión no iniciada en Instagram. Por favor loguéate manualmente en el navegador.');
				console.log('⏳ Esperando a que completes el inicio de sesión...');
				
				// Espera interactiva hasta que el campo de inicio de sesión desaparezca y aparezca la barra lateral o el home feed
				await page.waitForFunction(() => {
					return !document.querySelector('input[name="username"]');
				}, { timeout: 0 });
				
				console.log('✅ Sesión iniciada detectada. Continuando flujo...');
				await sleep(3000);
			}

			// Asegurarse de estar en la página principal
			if (!page.url().includes('instagram.com')) {
				await page.goto('https://www.instagram.com/');
				await sleep(3000);
			}

			// Descartar posibles popups de Instagram en secuencia (ej: guardar info, activar notificaciones)
			for (let i = 0; i < 2; i++) {
				const dismissBtn = page.getByRole('button', { name: 'Ahora no', exact: true }).or(page.locator('button:has-text("Ahora no")')).first();
				if (await dismissBtn.isVisible()) {
					console.log('🧹 Detectado popup de Instagram ("Ahora no"). Descartando...');
					await dismissBtn.click();
					await sleep(humanDelay(2000, 3000));
				} else {
					break;
				}
			}

			// 1. Localizar y hacer clic en el botón "Crear" (Left nav)
			console.log('🔍 Buscando botón "Crear"...');
			let createBtn = page.getByRole('link', { name: 'Crear', exact: false }).first();
			if (!await createBtn.isVisible()) {
				createBtn = page.locator('span:has-text("Crear")').first();
			}
			if (!await createBtn.isVisible()) {
				createBtn = page.locator('svg[aria-label="Nueva publicación"]').first();
			}

			if (await createBtn.isVisible()) {
				await createBtn.click();
				console.log('✅ Clic en "Crear". Esperando submenú...');
				await sleep(humanDelay(1000, 2000));
				
				// Simular pulsar Tab para enfocar "Publicación" y Enter para abrir el modal
				console.log('⌨️ Pulsando Tab y Enter para seleccionar el primer ítem ("Publicación")...');
				await page.keyboard.press('Tab');
				await sleep(humanDelay(300, 600));
				await page.keyboard.press('Enter');
				console.log('✅ Modal de publicación abierto.');
			} else {
				console.error('❌ No se pudo encontrar el botón "Crear". Abriendo inspector manual.');
				await page.pause();
			}

			await sleep(humanDelay(2000, 3000));

			// 2. Cargar imágenes
			const filesToUpload: string[] = [];
			const mainPath = item.relative_path ? normalizePath(item.relative_path) : null;
			const mainExists = mainPath && fs.existsSync(mainPath);

			// En Instagram, la primera foto cargada del lote se convierte en la foto de portada.
			if (mainExists && mainPath) {
				filesToUpload.push(mainPath);
			} else if (mainPath) {
				console.error(`❌ Imagen principal no encontrada: ${mainPath}`);
			}

			// Añadir hasta 9 imágenes de la galería (límite de 10 en total)
			const maxGallerySlots = mainExists ? 9 : 10;
			let galleryCount = 0;

			if (item.gallery_images && Array.isArray(item.gallery_images)) {
				for (const img of item.gallery_images) {
					if (galleryCount >= maxGallerySlots) {
						console.log(`⚠️ Excedido el límite de 10 imágenes en Instagram. Omitiendo el resto.`);
						break;
					}
					const imgPath = normalizePath(img);
					if (fs.existsSync(imgPath)) {
						if (imgPath !== mainPath && !filesToUpload.includes(imgPath)) {
							filesToUpload.push(imgPath);
							galleryCount++;
						}
					} else {
						console.warn(`⚠️ Imagen de galería no encontrada: ${imgPath}`);
					}
				}
			}

			if (filesToUpload.length === 0) {
				console.error(`❌ No se encontraron imágenes válidas para subir para: ${item.code}`);
				continue;
			}

			// Optimizar solo imágenes que excedan el límite de tamaño de Instagram
			const preparedFiles: string[] = [];
			for (const file of filesToUpload) {
				const readyFile = await prepareImageForInstagram(file);
				preparedFiles.push(readyFile);
			}

			console.log(`📸 Subiendo ${preparedFiles.length} imagen(es) (Carrusel)...`);
			const fileInput = page.locator('input[type="file"]').first();
			await fileInput.setInputFiles(preparedFiles);
			await sleep(humanDelay(3000, 5000));

			// 3. Paso 1 del Modal (Recortar / Crop)
			console.log('📐 Ajustando relación de aspecto a 4:5 (Paso 1/3)...');
			
			// Clic en el selector de relación de aspecto (icono de dos cuadrados / "Seleccionar recorte")
			let cropMenuBtn = page.locator('button').filter({ has: page.locator('svg[aria-label="Seleccionar recorte"]') }).first();
			if (!await cropMenuBtn.isVisible()) {
				cropMenuBtn = page.locator('svg[aria-label="Seleccionar recorte"]').locator('xpath=./ancestor::button').first();
			}
			if (!await cropMenuBtn.isVisible()) {
				cropMenuBtn = page.locator('svg[aria-label="Seleccionar recorte"]').locator('..').first();
			}

			if (await cropMenuBtn.isVisible()) {
				await cropMenuBtn.click();
				await sleep(humanDelay(800, 1500));
				
				// Buscamos y hacemos clic en el botón "Original" (puede ser un div con role="button")
				let ratioOriginalBtn = page.getByRole('button').filter({ hasText: 'Original' }).first();
				if (!await ratioOriginalBtn.isVisible()) {
					ratioOriginalBtn = page.locator('span:has-text("Original")').locator('xpath=./ancestor::div[@role="button"]').first();
				}
				if (!await ratioOriginalBtn.isVisible()) {
					ratioOriginalBtn = page.locator('text="Original"').first();
				}

				if (await ratioOriginalBtn.isVisible()) {
					await ratioOriginalBtn.click();
					console.log('✅ Relación de aspecto "Original" aplicada.');
				} else {
					console.warn('⚠️ No se encontró la opción "Original" en el menú de recorte.');
				}
				await sleep(humanDelay(800, 1500));
			} else {
				console.warn('⚠️ No se encontró el botón selector de recorte ("Seleccionar recorte").');
			}

			let nextBtn = page.getByRole('button', { name: 'Siguiente', exact: false }).first();
			if (!await nextBtn.isVisible()) {
				nextBtn = page.locator('button:has-text("Siguiente")').first();
			}

			if (await nextBtn.isVisible()) {
				await nextBtn.click();
				console.log('✅ Clic en "Siguiente" (Paso 1/3).');
			} else {
				console.warn('⚠️ Botón "Siguiente" no visible en recorte. Pausando para control manual.');
				await page.pause();
			}
			await sleep(humanDelay(1500, 2500));

			// 4. Paso 2 del Modal (Filtros / Filtros y Ajustes)
			console.log('🎨 Aplicando edición de filtros (Paso 2/3)...');
			if (await nextBtn.isVisible()) {
				await nextBtn.click();
			} else {
				nextBtn = page.getByRole('button', { name: 'Siguiente', exact: false }).first();
				if (await nextBtn.isVisible()) {
					await nextBtn.click();
				} else {
					console.warn('⚠️ Botón "Siguiente" no visible en filtros. Pausando para control manual.');
					await page.pause();
				}
			}
			await sleep(humanDelay(1500, 2500));

			// 5. Paso 3 del Modal (Escribir pie de foto / Detalles)
			console.log('✍️ Rellenando pie de foto y tags (Paso 3/3)...');
			
			let captionInput = page.getByRole('textbox').first();
			
			try {
				await captionInput.waitFor({ state: 'visible', timeout: 5000 });
			} catch (e) {
				// Fallbacks if getByRole fails
				captionInput = page.locator('div[aria-label*="pie de foto"]').first();
				if (!await captionInput.isVisible()) {
					captionInput = page.locator('div[contenteditable="true"]').first();
				}
			}

			if (await captionInput.isVisible()) {
				await captionInput.focus();
				await sleep(500);
				await page.keyboard.press('Control+A');
				await page.keyboard.press('Backspace');
				await sleep(300);
				await page.keyboard.insertText(item.description_instagram || '');
				console.log('✅ Pie de foto insertado correctamente.');
			} else {
				console.error('❌ Campo de texto de pie de foto no encontrado.');
				await page.pause();
			}
			await sleep(humanDelay(2000, 3000));

			// 6. Publicar / Compartir (Flujo Semiautomático con Espera)
			console.log('🚀 El post está listo para ser compartido.');
			let shareBtn = page.getByRole('button', { name: 'Compartir', exact: false }).first();
			if (!await shareBtn.isVisible()) {
				shareBtn = page.locator('button:has-text("Compartir")').first();
			}

			if (await shareBtn.isVisible()) {
				// Automatizamos el clic de Compartir
				console.log('➡️ Haciendo clic automático en "Compartir"...');
				await shareBtn.click();
				await sleep(5000);
			} else {
				console.log('⚠️ Botón "Compartir" no detectado. Por favor haz clic en publicar manualmente en la interfaz.');
				await page.pause();
			}

			// Esperamos la confirmación del éxito de Instagram
			console.log('⏳ Esperando confirmación de carga de Instagram (máx 60s)...');
			try {
				// Espera a que la tarjeta de éxito, texto o GIF animado aparezca en el modal
				const successText1 = page.getByText('Se ha compartido tu publicación', { exact: false });
				const successText2 = page.getByText('Se compartió tu publicación.', { exact: false });
				const successText3 = page.getByText('compartido', { exact: false });
				const successImg = page.locator('img[alt="Marca de verificación animada"]');
				
				const successSelector = successText1.or(successText2).or(successText3).or(successImg).first();
				
				await successSelector.waitFor({ state: 'visible', timeout: 60000 });
				console.log('✅ Publicación compartida con éxito en Instagram.');
			} catch (e) {
				console.log('⚠️ No se detectó la ventana de éxito automáticamente. Pausando para corroborar.');
				await page.pause();
			}

			// 7. Checkpoint
			if (typeof dataset[index].published !== 'object' || dataset[index].published === null) {
				dataset[index].published = { facebook: false, instagram: false };
			}
			dataset[index].published.instagram = true;

			fs.writeJsonSync(datasetPath, dataset, { spaces: 4 });
			console.log(`✅ Saved state: ${item.code} marked as published on Instagram.`);

			// Cerrar modal de éxito si está abierto (hacer clic en "Listo" o la X del modal superior derecha)
			let btnListo = page.getByRole('button', { name: 'Listo', exact: false }).first();
			if (!await btnListo.isVisible()) {
				btnListo = page.locator('text="Listo"').first();
			}
			
			const closeSuccessBtn = page.locator('svg[aria-label="Cerrar"]').first();

			if (await btnListo.isVisible()) {
				console.log('✅ Cerrando modal con botón "Listo".');
				await btnListo.click();
				await sleep(1000);
			} else if (await closeSuccessBtn.isVisible()) {
				console.log('✅ Cerrando modal con botón "X".');
				await closeSuccessBtn.click();
				await sleep(1000);
			} else {
				console.log('⚠️ No se encontró botón "Listo" ni "X" para cerrar el modal. Podría haberse cerrado solo.');
			}

			// Retraso de seguridad amplio para no levantar sospechas en Instagram
			const safetyWait = humanDelay(60000, 120000); // 1 a 2 minutos
			console.log(`⏳ Esperando ${Math.round(safetyWait / 1000)}s antes de procesar el siguiente post...`);
			await sleep(safetyWait);
		}

		console.log('🎉 Todos los productos del dataset han sido procesados para Instagram!');

	} catch (error) {
		console.error('❌ Ha ocurrido un error durante la ejecución:', error);
		await page.screenshot({ path: path.join(ERRORS_DIR, `error_ig_${Date.now()}.png`) });
	} finally {
		// Mantener abierto para control visual final
	}
}

run().catch(console.error);
