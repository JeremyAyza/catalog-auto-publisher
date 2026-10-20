import { describe, expect, it } from 'vitest';
import {
	BrandConfig,
	buildGenericClosing,
	buildInstagramDescription,
	buildMarketplaceDescription,
	buildMarketplaceFooter,
	parseBrand,
	toKeycapDigits,
} from '../brand';

const brand: BrandConfig = {
	name: 'Tienda Ejemplo',
	style: 'fashion',
	country: 'Perú',
	whatsapp: '900 111 222',
	instagram: '@tienda_ejemplo',
	facebook: 'Tienda Ejemplo',
	sizesLine: '🏷️ Tallas: S, M, L',
	shippingLine: '🚚 Envíos a todo el país',
	instagramClosing: '📩 Escríbenos al DM.',
	hashtags: '#TiendaEjemplo',
};

describe('parseBrand', () => {
	it('accepts a complete config', () => {
		expect(parseBrand(brand)).toEqual(brand);
	});

	it('lists every missing required field', () => {
		expect(() => parseBrand({ name: 'X', style: 'fashion' })).toThrow('country, whatsapp, shippingLine');
	});

	it('rejects an unknown style', () => {
		expect(() => parseBrand({ ...brand, style: 'luxury' })).toThrow('"style"');
	});
});

describe('toKeycapDigits', () => {
	it('turns digits into keycap emojis and keeps spaces', () => {
		expect(toKeycapDigits('90 12')).toBe('9️⃣0️⃣ 1️⃣2️⃣');
	});
});

describe('buildMarketplaceFooter', () => {
	it('builds the fixed footer from the brand', () => {
		const phone = '9️⃣0️⃣0️⃣ 1️⃣1️⃣1️⃣ 2️⃣2️⃣2️⃣';
		expect(buildMarketplaceFooter(brand)).toBe(
			'🏷️ Tallas: S, M, L\n\n' +
				'📩 Haz tu pedido por DM o vía WhatsApp\n' +
				`📱 ${phone}\n` +
				'🚚 Envíos a todo el país\n' +
				'📲 Conecta con tu estilo más vibrante:\n\n' +
				'📸 Más modelos en:\n' +
				'👉 Instagram: @tienda_ejemplo\n' +
				'👉 Facebook: Tienda Ejemplo\n' +
				`📱 ${phone}`
		);
	});

	it('skips optional lines that are not set', () => {
		const footer = buildMarketplaceFooter({ ...brand, sizesLine: undefined, instagram: undefined, facebook: undefined });
		expect(footer.startsWith('📩')).toBe(true);
		expect(footer).not.toContain('Instagram:');
		expect(footer).not.toContain('Facebook:');
	});
});

describe('buildMarketplaceDescription', () => {
	it('turns escaped newlines into real ones and collapses blank runs', () => {
		const text = buildMarketplaceDescription('Línea 1\\n\\n\\nLínea 2\n\n\n\nLínea 3', brand);
		expect(text.startsWith('Línea 1\n\nLínea 2\n\nLínea 3\n\n🏷️')).toBe(true);
		expect(text).not.toMatch(/\n{3,}/);
	});
});

describe('buildInstagramDescription', () => {
	it('appends the closing, tag hashtags and brand hashtags', () => {
		expect(buildInstagramDescription('Hola', ['vestido azul', ' lino '], brand)).toBe(
			'Hola\n\n📩 Escríbenos al DM.\n\n#vestidoazul #lino #TiendaEjemplo'
		);
	});

	it('works without tags or closing', () => {
		expect(buildInstagramDescription('Hola', undefined, { ...brand, instagramClosing: undefined })).toBe(
			'Hola\n\n#TiendaEjemplo'
		);
	});
});

describe('buildGenericClosing', () => {
	it('uses name, shipping line and keycap phone', () => {
		expect(buildGenericClosing(brand)).toBe(
			'Tienda Ejemplo. 🚚 Envíos a todo el país. Pedidos al WhatsApp: 9️⃣0️⃣0️⃣ 1️⃣1️⃣1️⃣ 2️⃣2️⃣2️⃣'
		);
	});
});
