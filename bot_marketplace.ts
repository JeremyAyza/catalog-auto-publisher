import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs-extra';
import { getLatestDataset, humanDelay, normalizePath, sleep, resolveDatasetPath } from './utils';
import { DatasetItem } from './types';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

chromium.use(stealthPlugin());

const SESSION_PATH = path.join(process.cwd(), 'fb_session');
const ERRORS_DIR = path.join(process.cwd(), 'errors');

// Ensure errors directory exists
fs.ensureDirSync(ERRORS_DIR);

async function run() {
	const datasetPath = resolveDatasetPath();
	console.log(`📂 Loaded dataset: ${datasetPath}`);

	const dataset: DatasetItem[] = fs.readJsonSync(datasetPath);
	const context = await chromium.launchPersistentContext(SESSION_PATH, {
		headless: false,
		args: ['--start-maximized'],
		viewport: null
	});

	const page = await context.newPage();

	try {


		for (const [index, item] of dataset.entries()) {

			const isFbPublished = typeof item.published === 'object' && item.published !== null
				? item.published.facebook
				: !!item.published;

			if (isFbPublished) {
				console.log(`⏭️ Skipping published item: ${item.code} (already on Facebook)`);
				continue;
			}

			console.log(`🚀 Processing Item: ${item.code} - ${item.titulo_premium || 'No Title'}`);

			await page.goto('https://www.facebook.com/marketplace/create/item');

			// 1. Upload Image(s)
			const filesToUpload: string[] = [];
			const mainPath = item.relative_path ? normalizePath(item.relative_path) : null;
			const mainExists = mainPath && fs.existsSync(mainPath);

			// Facebook Marketplace permite un máximo de 10 imágenes por publicación.
			// Reservamos un espacio para la imagen principal (portada), por lo que cargamos hasta 9 de la galería.
			const maxGallerySlots = mainExists ? 9 : 10;
			let galleryCount = 0;

			// Primero agregamos el resto de las imágenes de la galería (gallery_images) excluyendo la principal
			if (item.gallery_images && Array.isArray(item.gallery_images)) {
				for (const img of item.gallery_images) {
					if (galleryCount >= maxGallerySlots) {
						console.log(`⚠️ Excedido el límite de 10 imágenes. Omitiendo imágenes adicionales de la galería.`);
						break;
					}
					const imgPath = normalizePath(img);
					if (fs.existsSync(imgPath)) {
						if (imgPath !== mainPath && !filesToUpload.includes(imgPath)) {
							filesToUpload.push(imgPath);
							galleryCount++;
						}
					} else {
						console.warn(`⚠️ Gallery image not found: ${imgPath}`);
					}
				}
			}

			// Al final agregamos la imagen principal (relative_path) para que sea la última en subirse (portada en FB Marketplace)
			if (mainExists && mainPath) {
				if (!filesToUpload.includes(mainPath)) {
					filesToUpload.push(mainPath);
				} else {
					// Si por alguna razón ya estaba, la movemos al final
					const idx = filesToUpload.indexOf(mainPath);
					if (idx !== -1) {
						filesToUpload.splice(idx, 1);
					}
					filesToUpload.push(mainPath);
				}
			} else if (mainPath) {
				console.error(`❌ Main image not found: ${mainPath}`);
			}

			if (filesToUpload.length === 0) {
				console.error(`❌ No valid images found to upload for item: ${item.code}`);
				continue;
			}

			console.log(`📸 Uploading ${filesToUpload.length} image(s) for ${item.code}...`);

			// Locate file input - FB usually has a hidden file input or we can use setInputFiles on the page
			// A generic reliable way for FB Marketplace:
			const fileInput = await page.locator('input[type="file"]').first();
			await fileInput.setInputFiles(filesToUpload);
			await sleep(humanDelay(2000, 4000));

			// 2. Fill Title
			// Using robust selectors based on labels or generic structure
			await page.getByLabel('Título', { exact: false }).nth(0).fill(item.titulo_premium || '');
			await sleep(humanDelay(500, 1500));

			// 3. Fill Price
			const price = item.price ? item.price.toString() : '0';
			await page.getByLabel('Precio', { exact: false }).first().fill(price);
			await sleep(humanDelay(500, 1500));



			// 4. Category selection (Refactorizado para el HTML real de FB)
			if (item.category) {
				console.log(`📂 Selecting Category: ${item.category}`);

				// Usamos el label porque el combobox puede cambiar de role
				const catButton = page.getByLabel('Categoría', { exact: false }).first();

				if (await catButton.isVisible()) {
					await catButton.click();
					await sleep(humanDelay(1000, 1500));

					// Estrategia: Buscar el div/span que contiene el texto exacto de tu array CATEGORIES
					// Facebook renderiza todas las opciones en un menú flotante
					const optionToClick = page.locator('div[role="dialog"] span, div[role="menu"] span')
						.filter({ hasText: new RegExp(`^${item.category}$`, 'i') })
						.first();

					if (await optionToClick.isVisible()) {
						await optionToClick.click();
						console.log(`✅ Clicked category: ${item.category}`);
					} else {
						// BACKUP: Si no se ve, usamos el buscador interno que aparece al abrir categorías
						console.log(`🔍 Category not visible, typing search for: ${item.category}`);
						await page.keyboard.type(item.category);
						await sleep(1000);
						await page.keyboard.press('ArrowDown');
						await page.keyboard.press('Enter');
					}

					await sleep(humanDelay(800, 1200));
				}
			}


			// 5 Selección de Estado (Condicional: Solo si aparece)
			const stateButton = page.getByLabel('Estado', { exact: false }).first();
			if (await stateButton.isVisible()) {
				console.log("🛠️ Campo 'Estado' detectado. Seleccionando: Nuevo");
				await stateButton.click();
				await sleep(humanDelay(800, 1200));

				// Estrategia 1: Buscar el texto exacto "Nuevo" en el menú flotante
				const optionNew = page.locator('div[role="listbox"] span, div[role="menu"] span')
					.filter({ hasText: /^Nuevo$/ })
					.first();

				if (await optionNew.isVisible()) {
					await optionNew.click();
				} else {
					// Estrategia 2: Backup con teclado (Flecha abajo y Enter)
					// Ya que "Nuevo" suele ser la primera opción de la lista
					await page.keyboard.press('ArrowDown');
					await sleep(300);
					await page.keyboard.press('Enter');
				}

				console.log("✅ Estado marcado como 'Nuevo'");
				await sleep(humanDelay(500, 1000));
			}

			// 6. Fill brand
			// if (item.brand) {
			// 	const brand = item.brand ? item.brand.toString() : '';
			// 	await page.getByLabel('Marca', { exact: false }).first().fill(brand);
			// 	await sleep(humanDelay(500, 1500));
			// }


			// 7. Fill Description
			// Usamos focus, borramos y keyboard.insertText para forzar los saltos de línea (\n) nativos en React
			const descInput = page.getByLabel('Descripción', { exact: false }).first();
			if (await descInput.isVisible()) {
				await descInput.focus();
				await sleep(200);
				await page.keyboard.press('Control+A');
				await page.keyboard.press('Backspace');
				await sleep(200);
				await page.keyboard.insertText(item.description_marketplace || '');
				await sleep(humanDelay(500, 1500));
			}

			// 8. Llenado de Etiquetas (Tags)
			if (item.tags && item.tags.length > 0) {
				console.log(`🏷️ Insertando etiquetas: ${item.tags.join(', ')}`);

				// Buscamos el campo por su etiqueta visual
				const tagsInput = page.getByLabel('Etiquetas de productos', { exact: false }).first();

				if (await tagsInput.isVisible()) {
					await tagsInput.click();

					for (const tag of item.tags) {
						// Escribimos el tag
						await page.keyboard.type(tag);
						await sleep(humanDelay(300, 600));

						// Presionamos Enter para que Facebook convierta el texto en una etiqueta
						await page.keyboard.press('Enter');
						await sleep(humanDelay(200, 400));
					}
					console.log("✅ Etiquetas insertadas correctamente.");
				} else {
					console.log("⚠️ No se encontró el campo de etiquetas (es opcional en algunas categorías).");
				}
				await sleep(humanDelay(500, 1500));
			}



			console.log('🤖 Automating Final Steps...');

			// Click "Siguiente" (Next) - usually the first step after filling details
			const nextButton = page.getByRole('button', { name: 'Siguiente', exact: false }).first();
			if (await nextButton.isVisible()) {
				console.log('➡️ Clicking "Siguiente"...');
				await nextButton.click();
				await sleep(humanDelay(2000, 3000));
			}

			// Handle potential extra screens (Delivery, Groups)
			// checking for "Publicar" or another "Siguiente"
			let published = false;
			for (let i = 0; i < 3; i++) {
				const publishButton = page.getByRole('button', { name: 'Publicar', exact: false }).first();

				if (await publishButton.isVisible()) {
					console.log('🚀 Clicking "Publicar"...');
					await publishButton.click();
					published = true;
					// Wait for the dialogue to close or redirection
					await sleep(humanDelay(4000, 6000));
					break;
				}

				// If Publish not yet visible, check for Next again (sometimes 2 steps)
				const nextBtn = page.getByRole('button', { name: 'Siguiente', exact: false }).first();
				if (await nextBtn.isVisible()) {
					console.log('➡️ Clicking "Siguiente" again...');
					await nextBtn.click();
					await sleep(humanDelay(2000, 3000));
				} else {
					// No Next, No Publish... wait a bit?
					await sleep(2000);
				}
			}

			if (!published) {
				console.log('⚠️ "Publicar" button not found. Pausing for manual intervention.');
				await page.pause();
			} else {
				console.log('✅ Published successfully (assumed).');
			}


			// 6. Checkpoint
			// NOTE: If the script resumes, we assume the user successfully published or handled it
			if (typeof dataset[index].published !== 'object' || dataset[index].published === null) {
				dataset[index].published = { facebook: false, instagram: false };
			}
			dataset[index].published.facebook = true;
			
			fs.writeJsonSync(datasetPath, dataset, { spaces: 4 });
			console.log(`✅ Saved state: ${item.code} marked as published on Facebook.`);

			const safetyWait = humanDelay(60000, 120000); // 1 to 2 minutes
			console.log(`⏳ Waiting ${Math.round(safetyWait / 1000)}s before next item to be safe...`);
			await sleep(safetyWait);
		}

		console.log('🎉 All items processed!');

	} catch (error) {
		console.error('❌ An error occurred:', error);
		await page.screenshot({ path: path.join(ERRORS_DIR, `error_${Date.now()}.png`) });
	} finally {
		// await context.close(); // Keep open if desired, or close
	}
}

run().catch(console.error);
