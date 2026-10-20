export interface DatasetItem {
	code: string;
	relative_path: string;
	titulo_premium: string;
	description_marketplace: string;
	category: string;
	published: {
		facebook: boolean;
		instagram: boolean;
		whatsapp?: boolean;
	};
	price?: number | null;
	price_offer?: number | null;
	comercial_name?: string;
	description_premium?: string;
	brand?: string | null;
	tags?: string[];
	createdAt?: string;
	gallery_images?: string[];
	description_instagram?: string;
	short_descripcion?: string;
}

