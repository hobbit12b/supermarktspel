
export interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  timestamp: number;
  isFromBarcode?: boolean;
}

export interface CatalogProduct {
  barcode: string;
  name: string;
  price: number;
}

export enum AppState {
  HOME = 'HOME',
  CHECKOUT = 'CHECKOUT',
  SETTINGS = 'SETTINGS',
  BARCODES = 'BARCODES'
}
