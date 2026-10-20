import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'WhatsApp Business Automator',
    description: 'Automatiza la subida de productos al catálogo de WhatsApp Business.',
    version: '1.0.0',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['https://web.whatsapp.com/*']
  }
});
