export type InspectionStatus = 'Pass' | 'Fail' | 'N/A';

export interface InspectionPhoto {
  base64: string;
  name: string;
}

export interface InspectionItem {
  id: number;
  category: string;
  point: string;
  status: InspectionStatus;
  comments: string;
  location: string;
  photos: InspectionPhoto[];
}

export interface InspectionArea {
  id: number;
  name: string;
  items: InspectionItem[];
}

export interface InspectionData {
  id: string;
  clientName: string;
  propertyLocation: string;
  propertyType: 'Apartment' | 'Villa' | 'Building' | 'Other';
  inspectorName: string;
  inspectionDate: string;
  areas: InspectionArea[];
  aiSummary?: string;
}

// New types for Invoicing and Client Management
export interface Property {
  id: string;
  location: string;
  type: 'Commercial' | 'Residential';
  size: number; // in square meters
}

export interface Client {
  id:string;
  name: string;
  email: string;
  phone: string;
  address: string;
  properties: Property[];
}

export interface InvoiceServiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type InvoiceStatus = 'Paid' | 'Unpaid' | 'Partial' | 'Draft';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  clientId: string;
  clientName: string; 
  clientAddress: string;
  clientEmail: string;
  propertyLocation: string;
  services: InvoiceServiceItem[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  amountPaid: number;
  status: InvoiceStatus;
  notes?: string;
  template?: 'classic' | 'modern' | 'compact';
}