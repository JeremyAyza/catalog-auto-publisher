# catalog-wa-extension

Chrome extension (WXT, React, Zustand) that uploads products from a local dataset to the WhatsApp Business catalog in WhatsApp Web. It is part of [catalog-auto-publisher](../README.md); see the main README for the dataset format and `brand.json`.

```bash
npm install
npm run build      # load .output/chrome-mv3 as an unpacked extension
npm run dev        # dev mode with reload
npm test
```

Open WhatsApp Web, click **Seleccionar Carpeta** in the side panel, pick the project folder (the one with `datasets/`, the product photos and `brand.json`), then **Iniciar Subida**.
