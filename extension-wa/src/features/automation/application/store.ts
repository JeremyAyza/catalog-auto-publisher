import { create } from 'zustand';
import type { Product, LogEntry } from '../domain/types';
import { 
  getElementByAriaLabel, 
  getElementByTestId, 
  getElementByText, 
  base64ToFile, 
  sleep, 
  humanDelay, 
  fillField 
} from '../infrastructure/wa-dom';
import { readBrandCountry } from '../infrastructure/brand';

interface AutomationState {
  dirHandle: any | null;
  country: string | null;
  pendingProducts: { product: Product; fileHandle: any }[];
  status: string;
  logs: LogEntry[];
  isRunning: boolean;
  isCancelled: boolean;

  // Actions
  addLog: (message: string, type?: LogEntry['type']) => void;
  setStatus: (status: string) => void;
  cancelAutomation: () => void;
  handleSelectFolder: () => Promise<void>;
  runAutomation: () => Promise<void>;
}

export const useAutomationStore = create<AutomationState>((set, get) => ({
  dirHandle: null,
  country: null,
  pendingProducts: [],
  status: '',
  logs: [],
  isRunning: false,
  isCancelled: false,

  addLog: (message, type = 'info') => set((state) => ({
    logs: [...state.logs, { id: Date.now().toString() + Math.random(), message, type, timestamp: Date.now() }]
  })),

  setStatus: (status) => set({ status }),

  cancelAutomation: () => {
    set({ isCancelled: true });
    get().addLog('Automatización cancelada por el usuario.', 'warning');
    get().setStatus('Cancelado.');
  },

  handleSelectFolder: async () => {
    const { setStatus, addLog } = get();
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      set({ dirHandle: handle });

      const country = await readBrandCountry(handle);
      set({ country });
      if (!country) {
        addLog('No se encontró "country" en brand.json. Se omitirá el país de origen.', 'warning');
      }

      setStatus('Analizando datasets...');

      const products: {product: Product, fileHandle: any}[] = [];

      try {
        const datasetsHandle = await handle.getDirectoryHandle('datasets');
        for await (const entry of datasetsHandle.values()) {
          if (entry.kind === 'file' && entry.name.endsWith('.json')) {
            const file = await entry.getFile();
            const text = await file.text();
            const data: Product[] = JSON.parse(text);
            
            data.forEach(p => {
              if (!p.published?.whatsapp) {
                products.push({ product: p, fileHandle: entry });
              }
            });
          }
        }
      } catch (err) {
        console.error('No se encontró carpeta datasets', err);
        setStatus('Error: No se encontró la carpeta datasets o es ilegible.');
        return;
      }

      set({ pendingProducts: products });
      setStatus(`Se encontraron ${products.length} productos pendientes.`);
    } catch (error) {
      console.error(error);
      setStatus('Acceso denegado o cancelado al directorio.');
    }
  },

  runAutomation: async () => {
    const { dirHandle, country, pendingProducts, addLog, setStatus } = get();
    if (!dirHandle || pendingProducts.length === 0) return;
    
    set({ isRunning: true, isCancelled: false });
    setStatus('Iniciando subida...');
    addLog(`Iniciando automatización para ${pendingProducts.length} productos.`, 'info');

    // Helper file resolver
    const getFileFromPath = async (rootHandle: any, relativePath: string): Promise<File | null> => {
      const parts = relativePath.split(/[\\/]/).filter(Boolean);
      let current = rootHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        try {
          current = await current.getDirectoryHandle(parts[i]);
        } catch (e) {
          return null;
        }
      }
      try {
        const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
        return await fileHandle.getFile();
      } catch (e) {
        return null;
      }
    };

    const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });

    let count = 0;
    for (const item of pendingProducts) {
      if (get().isCancelled) break;

      const { product, fileHandle } = item;
      setStatus(`Subiendo ${count + 1}/${pendingProducts.length}: ${product.code}`);
      addLog(`Procesando producto: ${product.code}`, 'info');

      try {
        const filesToUpload: { name: string, data: string, path: string }[] = [];
        const seenPaths = new Set<string>();
        const seenNames = new Set<string>(); // Backend rechaza nombres base repetidos
        
        const getNormalizedName = (filename: string) => {
          let name = filename;
          // Quitar extensión
          const lastDot = name.lastIndexOf('.');
          if (lastDot !== -1) {
            name = name.substring(0, lastDot);
          }
          
          // Eliminar sufijos de copias: " - 2", "_2", " (2)", "__"
          name = name.replace(/[-_ ]+(?:\(?\d+\)?)?$/, ''); 
          name = name.replace(/\(\d+\)$/, ''); // Por si está pegado como "foto(2)"
          name = name.replace(/[-_ ]+$/, ''); // Limpiar cualquier "_" final restante
          
          return name.toLowerCase().trim();
        };

        if (product.relative_path) {
          const file = await getFileFromPath(dirHandle, product.relative_path);
          if (file) {
            filesToUpload.push({ name: file.name, data: await toBase64(file), path: product.relative_path });
            seenPaths.add(product.relative_path);
            seenNames.add(getNormalizedName(file.name));
          }
        }

        if (product.gallery_images) {
          for (const imgPath of product.gallery_images) {
            if (filesToUpload.length >= 7) break;
            if (!seenPaths.has(imgPath)) {
              seenPaths.add(imgPath);
              const file = await getFileFromPath(dirHandle, imgPath);
              if (file) {
                const baseName = getNormalizedName(file.name);
                if (!seenNames.has(baseName)) {
                  seenNames.add(baseName);
                  filesToUpload.push({ name: file.name, data: await toBase64(file), path: imgPath });
                }
              }
            }
          }
        }

        addLog(`Paso 1: Imágenes únicas a subir (${filesToUpload.length})`, 'info');

        // 1. Clic Herramientas
        const btnHerramientas = getElementByAriaLabel('Herramientas');
        if (btnHerramientas) {
          btnHerramientas.click();
          await sleep(humanDelay(1500, 2500));
        }

        // 2. Clic Catálogo
        const btnCatalogo = getElementByTestId('biz-tools-catalog') || getElementByAriaLabel('Catálogo');
        if (btnCatalogo) {
          btnCatalogo.click();
          await sleep(humanDelay(2000, 3500));
        }

        // 3. Clic Añadir artículo nuevo
        const btnAnadir = getElementByText('Añadir un artículo nuevo');
        if (btnAnadir) {
          btnAnadir.click();
          await sleep(humanDelay(2000, 4000));
        }

        // 4. Subir Imágenes (Una por una para no saturar al backend)
        addLog(`Paso 2: Subiendo imágenes una por una...`, 'info');
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput && filesToUpload.length > 0) {
          for (let i = 0; i < filesToUpload.length; i++) {
            if (get().isCancelled) break;
            const img = filesToUpload[i];
            if (!img) continue;
            
            const dt = new DataTransfer();
            const file = base64ToFile(img.data, img.name);
            dt.items.add(file);
            
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            addLog(`Subida imagen ${i + 1}/${filesToUpload.length}...`, 'info');
            await sleep(humanDelay(4000, 6000)); // Esperar a que la imagen se procese en el backend
          }
        }

        // Helper de tipeado
        addLog(`Paso 3: Llenando formulario (Nombre, Precio, Descripción)`, 'info');
        
        await fillField('Nombre', product.comercial_name || '');
        const price = product.price ? product.price.toString() : '100';
        await fillField('Precio en PEN (recomendado)', price);
        if (product.price_offer) {
          await fillField('Precio de oferta PEN', product.price_offer.toString());
        }
        await fillField('Descripción (opcional)', product.short_descripcion || '');

        // 5. País de Origen
        addLog(`Paso 4: Seleccionando País de Origen`, 'info');
        
        let paisInput = document.querySelector('[data-testid="product-edit-drawer-compliance-country-of-origin-input"]') as HTMLElement;
        if (!paisInput) {
          const labelEl = getElementByText('País de origen (obligatorio)') || getElementByText('País de origen');
          if (labelEl) {
            let container = labelEl.parentElement;
            while (container && !container.querySelector('[contenteditable="true"]')) {
              container = container.parentElement;
              if (container && container.tagName === 'BODY') break;
            }
            if (container) {
              paisInput = container.querySelector('[contenteditable="true"]') as HTMLElement;
            } else {
              paisInput = labelEl as HTMLElement; // Fallback al label si no hay textbox
            }
          }
        }

        if (paisInput && !country) {
          addLog(`Sin país configurado en brand.json. Saltando paso...`, 'warning');
        } else if (paisInput && country) {
          paisInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(humanDelay(400, 600));

          paisInput.focus(); // Vital para React/contenteditable
          await sleep(humanDelay(200, 400));
          
          // A veces React escucha mousedown antes que click
          paisInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          paisInput.click();
          
          // Esperar activamente a que aparezca la opción del país (hasta 15 segundos)
          let countryOption: HTMLElement | null = null;
          for (let i = 0; i < 30; i++) {
            if (get().isCancelled) break;
            
            // Busca el label exacto del país (getElementByText soporta <label>)
            countryOption = getElementByText(country);
            if (countryOption && countryOption.tagName === 'LABEL') {
              break;
            }
            // Fallback por si la busqueda por texto no lo agarra limpio
            const allLabels = Array.from(document.querySelectorAll('label[data-testid="country-selector-popup-option-label"]'));
            const countryLabel = allLabels.find(l => l.textContent?.includes(country));
            if (countryLabel) {
              countryOption = countryLabel as HTMLElement;
              break;
            }
            
            await sleep(500);
          }

          if (countryOption) {
            countryOption.click();
            await sleep(humanDelay(800, 1500));
            
            const btnGuardar = getElementByText('Guardar');
            if (btnGuardar) btnGuardar.click();
            await sleep(humanDelay(1500, 3000));
          } else {
            addLog(`No se pudo seleccionar el país. Saltando paso...`, 'warning');
          }
        }

        // 6. Añadir al catálogo
        addLog(`Paso 5: Guardando en catálogo...`, 'info');
        const btnFinal = getElementByText('Añadir al catálogo');
        if (btnFinal) {
          btnFinal.click();
          
          addLog(`Esperando confirmación de subida (aprox 45s)...`, 'info');
          let success = false;
          for (let i = 0; i < 24; i++) {
            if (get().isCancelled) break;
            if (getElementByText('Se está revisando este artículo') || getElementByText('Se está revisando este artículo.')) {
              success = true;
              break;
            }
            await sleep(2000);
          }
          
          if (!success && !get().isCancelled) {
            throw new Error("No se pudo confirmar que se guardó con éxito (Timeout de confirmación)");
          }
        }
        
        if (get().isCancelled) break;

        // Actualizar JSON
        const jsonFile = await fileHandle.getFile();
        const jsonText = await jsonFile.text();
        const jsonData: Product[] = JSON.parse(jsonText);
        
        const idx = jsonData.findIndex(p => p.code === product.code);
        if (idx !== -1) {
          const p = jsonData[idx];
          if (p) {
            if (!p.published) p.published = {};
            p.published.whatsapp = true;
          }
          
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(jsonData, null, 4));
          await writable.close();
        }
        
        addLog(`✅ Producto ${product.code} subido correctamente`, 'success');
        count++;

        // Pausa entre productos (al azar para evitar spam detect)
        await sleep(humanDelay(8000, 15000));

      } catch (err: any) {
        addLog(`❌ Error en producto ${product.code}: ${err.message}`, 'error');
        setStatus(`Error en subida: ${err.message}`);
        break;
      }
    }

    if (count === pendingProducts.length && !get().isCancelled) {
      setStatus('✅ Todo publicado correctamente.');
      addLog('🎉 Automatización completada', 'success');
      set({ pendingProducts: [] });
    }
    set({ isRunning: false });
  }
}));
