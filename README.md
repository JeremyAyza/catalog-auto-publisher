# E-Commerce AI Catalog Generator & Publisher

Sistema de estructuración de catálogos con OpenAI GPT-4o Vision, publicación asistida por Playwright en Facebook Marketplace e Instagram, y extensión WXT para WhatsApp Web.

> **Aviso de seguridad:** El sistema utiliza la estrategia "Human-in-the-loop", rellenando automáticamente los formularios pero requiriendo confirmación manual del usuario para enviar la publicación.

## Qué resuelve

Automatiza la creación de catálogos comerciales a partir de fotografías. Extrae datos estructurados (títulos, descripciones y copys optimizados) usando GPT-4o Vision, rellena las fichas de publicación en plataformas Meta mediante Playwright y facilita la atención por WhatsApp Web usando una extensión de navegador dedicada.

## Cómo funciona

1. **Estructuración con IA (`generate_dataset.ts`):** Procesa las imágenes con la API de OpenAI GPT-4o Vision y guarda la información enriquecida en `datasets/`.
2. **Autenticación Persistente (`login.ts`):** Inicia una sesión interactiva en Facebook y conserva la información de autenticación local.
3. **Publicación Asistida (`bot_marketplace.ts` / `bot_instagram.ts`):** Lee el dataset y rellena los formularios de venta dejando el paso final para confirmación humana.
4. **Extensión WhatsApp Web (`extension-wa/`):** Lee los datos del catálogo local desde el navegador para agilizar la interacción comercial.

## Guía de uso

### Requisitos
- Node.js 18+ o Bun
- npm 9+
- Clave de API de OpenAI

### Instalación
```bash
git clone https://github.com/JeremyAyza/ecommerce-ai-catalog-publisher.git
cd ecommerce-ai-catalog-publisher
npm install
```

### Configuración
```bash
cp .env.example .env
```

### Ejecución del Flujo

1. **Generar Catálogo desde Imágenes:**
```bash
npm run generate
```

2. **Iniciar Sesión en Facebook:**
```bash
npm run login
```

3. **Ejecutar Bot de Publicación:**
```bash
npm run bot
```

## Decisiones técnicas

- **OpenAI GPT-4o Vision:** Extrae características de productos directamente desde fotos sin requerir llenado manual de fichas.
- **Human-in-the-loop (Playwright):** Evita la detección automática de bots de Meta al dejar el clic de confirmación final al usuario.
- **Estructura Monorepo:** Consolida la extensión de WhatsApp Web (`extension-wa/`) dentro del repositorio backend para mantener una sola fuente de código.
- **Resiliencia por Checkpoints:** Guarda el progreso en JSON incremental para permitir la reanudación del flujo ante interrupciones.

## Estado y límites conocidos

- **Estado:** Prototipo funcional probado en entorno local.
- **Límites:** Requiere intervención humana manual durante el proceso de publicación para cumplir con las políticas de automatización de Meta.
- **Pruebas:** Verificación ejecutada mediante análisis estático de código.

## Créditos y licencia

- **Autor:** Jeremy Ayza ([JeremyAyza](https://github.com/JeremyAyza))
- **Licencia:** MIT License
