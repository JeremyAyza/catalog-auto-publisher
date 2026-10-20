import { createRoot } from 'react-dom/client';
import { OverlayApp } from '../src/features/automation/presentation/OverlayApp';
import '../assets/tailwind.css';

export default defineContentScript({
  matches: ['*://web.whatsapp.com/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'wa-automator-overlay',
      position: 'inline',
      anchor: 'body',
      append: 'first',
      onMount: (container) => {
        const wrapper = document.createElement('div');
        container.append(wrapper);
        const root = createRoot(wrapper);
        root.render(<OverlayApp />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
