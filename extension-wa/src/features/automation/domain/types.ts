export interface Product {
  code: string;
  relative_path: string;
  gallery_images: string[];
  published?: {
    whatsapp?: boolean;
    facebook?: boolean;
  };
  titulo_premium?: string;
  comercial_name?: string;
  price?: number;
  price_offer?: number;
  description_marketplace?: string;
  short_descripcion?: string;
}

export type AutomationStatus = 'idle' | 'running' | 'error' | 'success';

export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  timestamp: number;
}
