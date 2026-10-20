import type { Product } from '../domain/types';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const humanDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const base64ToFile = (base64: string, filename: string): File => {
  const arr = base64.split(',');
  const firstPart = arr[0] || '';
  const mimeMatch = firstPart.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : '';
  const bstr = atob(arr[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

export const getElementByText = (text: string): HTMLElement | null => {
  const xpath = `//span[contains(text(), '${text}')] | //div[contains(text(), '${text}')] | //label[contains(text(), '${text}')]`;
  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue as HTMLElement;
};

export const getElementByAriaLabel = (label: string): HTMLElement | null => {
  return document.querySelector(`[aria-label="${label}"]`);
};

export const getElementByTestId = (id: string): HTMLElement | null => {
  return document.querySelector(`[data-testid="${id}"]`);
};

export const fillField = async (labelText: string, value: string) => {
  if (!value) return;
  
  let inputEl = document.querySelector(`[role="textbox"][aria-label="${labelText}"]`) as HTMLElement;
  
  if (!inputEl) {
    // Fallback robusto: buscar el label visual y encontrar el contenteditable asociado
    const labelEl = getElementByText(labelText);
    if (labelEl) {
      // Subir hasta el contenedor principal del campo
      let container = labelEl.parentElement;
      while (container && !container.querySelector('[contenteditable="true"]')) {
        container = container.parentElement;
        if (container && container.tagName === 'BODY') break; // evitar loop infinito
      }
      
      if (container) {
        inputEl = container.querySelector('[contenteditable="true"]') as HTMLElement;
      }
    }
  }

  if (inputEl) {
    inputEl.focus();
    await sleep(300);
    document.execCommand('insertText', false, value);
    await sleep(humanDelay(500, 1000));
  } else {
    console.error(`Error: No se encontró el campo de texto para "${labelText}"`);
  }
};
