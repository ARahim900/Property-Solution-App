

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InspectionData, InspectionArea, InspectionItem, InspectionPhoto, InspectionStatus, Client, Invoice, InvoiceStatus, InvoiceServiceItem, Property, AppSettings, PredefinedService } from './types';
import { INSPECTION_CATEGORIES, MOCK_CLIENTS, PREDEFINED_SERVICES } from './constants';
import { WaslaReportGenerator } from './services/pdfGenerator';
import jsPDF from 'jspdf';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);


// --- Local Storage Hooks ---
const useInspections = () => {
    const getInspections = (): InspectionData[] => {
        try {
            const inspections = JSON.parse(localStorage.getItem('inspections') || '[]') as InspectionData[];
            return inspections.sort((a, b) => new Date(b.inspectionDate).getTime() - new Date(a.inspectionDate).getTime());
        } catch (error) {
            console.error("Error parsing inspections from localStorage", error);
            return [];
        }
    };

    const getInspectionById = (id: string): InspectionData | null => {
        const inspections = getInspections();
        return inspections.find(insp => insp.id === id) || null;
    };

    const saveInspection = (inspectionData: InspectionData): void => {
        try {
            const inspections = getInspections().filter(insp => insp.id !== inspectionData.id);
            inspections.push(inspectionData);
            localStorage.setItem('inspections', JSON.stringify(inspections));
        } catch (error) {
            console.error("Failed to save inspection:", error);
            if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                alert("Could not save inspection. The browser storage is full. Please try removing old inspections or photos.");
            } else {
                alert("An unexpected error occurred while saving. Please check the console for details.");
            }
        }
    };
    
    const deleteInspection = (id: string): void => {
        const inspections = getInspections().filter(insp => insp.id !== id);
        localStorage.setItem('inspections', JSON.stringify(inspections));
    };

    return { getInspections, getInspectionById, saveInspection, deleteInspection };
};

const useClients = () => {
    const getClients = (): Client[] => {
        try {
            const clients = localStorage.getItem('clients');
            if (clients) {
                return JSON.parse(clients) as Client[];
            }
            // If no clients, load mock data and save it
            localStorage.setItem('clients', JSON.stringify(MOCK_CLIENTS));
            return MOCK_CLIENTS;
        } catch (error) {
            console.error("Error parsing clients from localStorage", error);
            return [];
        }
    };

    const saveClient = (clientData: Client): void => {
        const clients = getClients().filter(c => c.id !== clientData.id);
        clients.push(clientData);
        localStorage.setItem('clients', JSON.stringify(clients));
    };

    const deleteClient = (id: string): void => {
        const clients = getClients().filter(c => c.id !== id);
        localStorage.setItem('clients', JSON.stringify(clients));
    };
    
    return { getClients, saveClient, deleteClient };
};

const useInvoices = () => {
    const getInvoices = (): Invoice[] => {
        try {
            const invoices = JSON.parse(localStorage.getItem('invoices') || '[]') as Invoice[];
            return invoices.sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
        } catch (error) {
            console.error("Error parsing invoices from localStorage", error);
            return [];
        }
    };
    
    const getInvoiceById = (id: string): Invoice | null => {
        return getInvoices().find(inv => inv.id === id) || null;
    };

    const saveInvoice = (invoiceData: Invoice): void => {
        const invoices = getInvoices().filter(inv => inv.id !== invoiceData.id);
        invoices.push(invoiceData);
        localStorage.setItem('invoices', JSON.stringify(invoices));
    };

    const deleteInvoice = (id: string): void => {
        const invoices = getInvoices().filter(inv => inv.id !== id);
        localStorage.setItem('invoices', JSON.stringify(invoices));
    };

    return { getInvoices, getInvoiceById, saveInvoice, deleteInvoice };
};

const useAppSettings = () => {
    const defaultAvatar = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#cbd5e1"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>')}`;

    const defaultSettings: AppSettings = {
        theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'dark',
        notifications: { email: true, push: false },
        language: 'en',
        profile: {
            name: 'Alex Johnson',
            email: 'alex.j@inspectorpro.dev',
            phone: '+1-555-123-4567',
            avatar: defaultAvatar,
        },
    };
    
    const getSettings = (): AppSettings => {
        try {
            const stored = localStorage.getItem('appSettings');
            if (stored) {
                const parsed = JSON.parse(stored);
                // Deep merge with defaults to handle new settings being added
                return {
                    ...defaultSettings,
                    ...parsed,
                    notifications: { ...defaultSettings.notifications, ...parsed.notifications },
                    profile: { ...defaultSettings.profile, ...parsed.profile },
                };
            }
            localStorage.setItem('appSettings', JSON.stringify(defaultSettings));
            return defaultSettings;
        } catch (e) {
            console.error("Failed to parse app settings:", e);
            return defaultSettings;
        }
    };

    const saveSettings = (settings: AppSettings) => {
        localStorage.setItem('appSettings', JSON.stringify(settings));
        localStorage.setItem('theme', settings.theme); // Also save theme separately for initial load
    };
    
    return { getSettings, saveSettings };
};


// --- Helper Functions ---
const resizeAndCompressImage = (file: File, maxSize = 1024, quality = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      if (!event.target?.result) {
        return reject(new Error("FileReader did not return a result."));
      }
      const img = new Image();
      img.src = event.target.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get canvas context'));
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    // Handles 'YYYY-MM-DD' format from date inputs
    const date = new Date(dateString);
    const timeZoneOffset = date.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(date.getTime() + timeZoneOffset);

    return adjustedDate.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};

const formatCurrency = (amount: number, currency = 'OMR') => {
    const formattedAmount = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
    
    return currency ? `${currency} ${formattedAmount}` : formattedAmount;
};


// --- UI Components ---
const buttonClasses = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:bg-blue-400",
    secondary: "bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950",
    destructive: "bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950",
};

const inputClasses = "block w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition";

const Spinner: React.FC<{ className?: string }> = ({ className = 'text-white' }) => (
    <svg className={`animate-spin h-5 w-5 ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
    </svg>
);

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode, size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' }> = ({ isOpen, onClose, title, children, size = '2xl' }) => {
    if (!isOpen) return null;
    const sizeClasses = {
        'sm': 'max-w-sm',
        'md': 'max-w-md',
        'lg': 'max-w-lg',
        'xl': 'max-w-xl',
        '2xl': 'max-w-2xl',
    };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 dark:bg-opacity-80 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className={`bg-white dark:bg-slate-900 rounded-xl shadow-xl p-6 w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto transition-all transform scale-95 opacity-0 animate-scale-in`} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center border-b dark:border-slate-800 pb-3 mb-4">
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
                    <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-2xl transition-colors">&times;</button>
                </div>
                {children}
            </div>
            <style>{`
                @keyframes scale-in {
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                .animate-scale-in {
                    animation: scale-in 0.2s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

const ConfirmationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  confirmButtonClass?: string;
}> = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm' }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
            <div>
                <p className="text-slate-700 dark:text-slate-300">{message}</p>
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onClose} className={buttonClasses.secondary}>Cancel</button>
                    <button type="button" onClick={onConfirm} className={buttonClasses.destructive}>{confirmText}</button>
                </div>
            </div>
        </Modal>
    );
};

const PhotoUpload: React.FC<{ photos: InspectionPhoto[]; onUpload: (photo: InspectionPhoto) => void; onRemove: (index: number) => void }> = ({ photos, onUpload, onRemove }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
// FIX: Cast FileList to File[] to address a type inference issue where 'file' was 'unknown'.
            for (const file of Array.from(event.target.files) as File[]) {
                try {
                    const base64WithMime = await resizeAndCompressImage(file, 1024, 0.8);
                    const base64 = base64WithMime.split(',')[1]
                    onUpload({ base64, name: file.name });
                } catch (error) {
                    console.error("Error processing image", error);
                    alert("There was an error processing the image. Please try a different file.");
                }
            }
        }
    };
    
    return (
        <div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-2">
                {photos.map((photo, index) => (
                    <div key={index} className="relative group aspect-square">
                        <img src={`data:image/jpeg;base64,${photo.base64}`} alt={`upload-preview-${index}`} className="w-full h-full object-cover rounded-lg" />
                        <button type="button" onClick={() => onRemove(index)} className="absolute top-1 right-1 bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-square border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-blue-500 hover:text-blue-600 transition"
                    aria-label="Add Photo"
                >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v16m8-8H4"></path></svg>
                    <span className="text-xs mt-1">Add Photo</span>
                </button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="image/*" />
        </div>
    );
};

const InspectionItemRow: React.FC<{ item: InspectionItem; onUpdate: (updatedItem: InspectionItem) => void; onRemove: () => void; }> = ({ item, onUpdate, onRemove }) => {

    const handleUpdate = (field: keyof InspectionItem, value: any) => {
        onUpdate({ ...item, [field]: value });
    };

    const statusClasses: { [key in InspectionStatus]: string } = {
        'Pass': 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700',
        'Fail': 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700',
        'N/A': 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    };

    return (
        <div className="bg-white dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{item.point}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{item.category}</p>
                </div>
                <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-xl font-bold transition-colors">&times;</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                    <select value={item.status} onChange={e => handleUpdate('status', e.target.value)} className={`w-full p-2 rounded-lg border ${statusClasses[item.status]}`}>
                        <option value="Pass">Pass</option>
                        <option value="Fail">Fail</option>
                        <option value="N/A">N/A</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Location</label>
                    <input type="text" value={item.location} onChange={e => handleUpdate('location', e.target.value)} placeholder="e.g., Master Bedroom Ceiling" className={inputClasses}/>
                </div>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Comments</label>
                <textarea value={item.comments} onChange={e => handleUpdate('comments', e.target.value)} placeholder="Add comments..." rows={3} className={inputClasses}></textarea>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Photos</label>
                 <PhotoUpload
                    photos={item.photos}
                    onUpload={(photo) => handleUpdate('photos', [...item.photos, photo])}
                    onRemove={(index) => handleUpdate('photos', item.photos.filter((_, i) => i !== index))}
                />
            </div>
        </div>
    );
};

const InspectionAreaCard: React.FC<{ area: InspectionArea; onUpdate: (updatedArea: InspectionArea) => void; onRemove: () => void }> = ({ area, onUpdate, onRemove }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [customPoint, setCustomPoint] = useState('');
    const [customCategory, setCustomCategory] = useState('Custom');

    const handleNameChange = (newName: string) => {
        onUpdate({ ...area, name: newName });
    };

    const handleAddItem = (category: string, point: string) => {
        const newItem: InspectionItem = {
            id: Date.now(),
            category,
            point,
            status: 'N/A',
            comments: '',
            location: '',
            photos: [],
        };
        onUpdate({ ...area, items: [...area.items, newItem] });
    };

    const handleUpdateItem = (updatedItem: InspectionItem) => {
        const newItems = area.items.map(item => item.id === updatedItem.id ? updatedItem : item);
        onUpdate({ ...area, items: newItems });
    };
    
    const handleRemoveItem = (itemId: number) => {
        const newItems = area.items.filter(item => item.id !== itemId);
        onUpdate({ ...area, items: newItems });
    };

    const handleAddCustomItem = () => {
        if (customPoint.trim() === '') {
            alert('Please enter a name for the custom inspection point.');
            return;
        }
        handleAddItem(customCategory.trim() || 'Custom', customPoint.trim());
        setCustomPoint('');
        setCustomCategory('Custom');
        setIsModalOpen(false);
    };

    return (
        <div className="bg-slate-100/50 dark:bg-slate-900/60 rounded-xl p-4 shadow-sm mb-6 border dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
                <input
                    type="text"
                    value={area.name}
                    onChange={e => handleNameChange(e.target.value)}
                    className="text-xl font-bold bg-transparent border-b-2 border-transparent focus:border-blue-500 outline-none text-slate-900 dark:text-slate-100 transition-colors"
                    placeholder="Area Name"
                />
                <button type="button" onClick={onRemove} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-semibold transition-colors">Remove Area</button>
            </div>
            
            <div className="space-y-4">
                {area.items.map(item => <InspectionItemRow key={item.id} item={item} onUpdate={handleUpdateItem} onRemove={() => handleRemoveItem(item.id)} />)}
            </div>

            <button type="button" onClick={() => setIsModalOpen(true)} className={`mt-4 w-full ${buttonClasses.primary}`}>
                Add Inspection Point
            </button>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Inspection Point">
                <div className="p-4 mb-4 border rounded-lg bg-slate-50 dark:bg-slate-800/50 dark:border-slate-700">
                    <h4 className="font-semibold text-lg text-slate-700 dark:text-slate-300 mb-2">Add Custom Point</h4>
                    <div className="space-y-2">
                        <input type="text" value={customPoint} onChange={(e) => setCustomPoint(e.target.value)} placeholder="e.g., Check for window seal drafts" className={inputClasses} />
                        <input type="text" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Category (e.g., Windows)" className={inputClasses} />
                        <button type="button" onClick={handleAddCustomItem} className={`w-full ${buttonClasses.primary}`}>Add Custom Point</button>
                    </div>
                </div>

                <div className="border-t dark:border-slate-700 pt-4">
                    <h4 className="font-semibold text-lg text-slate-700 dark:text-slate-300 mb-2">Or Select a Predefined Point</h4>
                    <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
                        {Object.entries(INSPECTION_CATEGORIES).map(([category, points]) => (
                            <div key={category}>
                                <h4 className="font-semibold text-lg text-slate-700 dark:text-slate-300 mb-2 border-b dark:border-slate-700 pb-1">{category}</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {points.map(point => (
                                        <button
                                            type="button"
                                            key={point}
                                            onClick={() => { handleAddItem(category, point); setIsModalOpen(false); }}
                                            className="text-left p-2 bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg text-sm transition text-slate-800 dark:text-slate-300"
                                        >
                                            {point}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const InspectionForm: React.FC<{ inspectionId?: string; onSave: () => void; onCancel: () => void }> = ({ inspectionId, onSave, onCancel }) => {
    const { getInspectionById, saveInspection } = useInspections();
    const [inspection, setInspection] = useState<InspectionData | null>(null);

    useEffect(() => {
        if (inspectionId) {
            setInspection(getInspectionById(inspectionId));
        } else {
            const today = new Date();
            const localTodayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            setInspection({
                id: `insp_${Date.now()}`,
                clientName: '',
                propertyLocation: '',
                propertyType: 'Apartment',
                inspectorName: '',
                inspectionDate: localTodayString,
                areas: [{ id: Date.now(), name: 'General', items: [] }],
            });
        }
    }, [inspectionId]);

    const handleUpdateField = (field: keyof InspectionData, value: any) => {
        if (inspection) {
            setInspection({ ...inspection, [field]: value });
        }
    };
    
    const handleAddArea = () => {
        if (inspection) {
            const newArea: InspectionArea = { id: Date.now(), name: `New Area ${inspection.areas.length + 1}`, items: [] };
            handleUpdateField('areas', [...inspection.areas, newArea]);
        }
    };

    const handleUpdateArea = (updatedArea: InspectionArea) => {
        if (inspection) {
            const newAreas = inspection.areas.map(area => area.id === updatedArea.id ? updatedArea : area);
            handleUpdateField('areas', newAreas);
        }
    };

    const handleRemoveArea = (areaId: number) => {
        if (inspection) {
            const newAreas = inspection.areas.filter(area => area.id !== areaId);
            handleUpdateField('areas', newAreas);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inspection) {
            saveInspection(inspection);
            onSave();
        }
    };

    if (!inspection) return <div className="text-center p-8"><Spinner className="text-blue-600 dark:text-blue-400 mx-auto" /></div>;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border dark:border-slate-800">
                <h2 className="text-2xl font-bold mb-4 text-slate-800 dark:text-slate-100">Inspection Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" placeholder="Client Name" value={inspection.clientName} onChange={e => handleUpdateField('clientName', e.target.value)} required className={inputClasses} />
                    <input type="text" placeholder="Property Location" value={inspection.propertyLocation} onChange={e => handleUpdateField('propertyLocation', e.target.value)} required className={inputClasses} />
                    <input type="text" placeholder="Inspector Name" value={inspection.inspectorName} onChange={e => handleUpdateField('inspectorName', e.target.value)} required className={inputClasses} />
                    <input type="date" value={inspection.inspectionDate} onChange={e => handleUpdateField('inspectionDate', e.target.value)} required className={inputClasses} />
                    <div>
                        <select
                            value={inspection.propertyType}
                            onChange={e => handleUpdateField('propertyType', e.target.value)}
                            required
                            className={`${inputClasses} w-full`}
                        >
                            <option value="Apartment">Apartment</option>
                            <option value="Villa">Villa</option>
                            <option value="Building">Building</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>
            </div>

            <div>
                {inspection.areas.map(area => (
                    <InspectionAreaCard key={area.id} area={area} onUpdate={handleUpdateArea} onRemove={() => handleRemoveArea(area.id)} />
                ))}
            </div>

            <div className="flex items-center justify-between gap-4">
                <button type="button" onClick={handleAddArea} className={buttonClasses.secondary}>
                    Add Another Area
                </button>
                <div className="flex gap-4">
                    <button type="button" onClick={onCancel} className={buttonClasses.secondary}>Cancel</button>
                    <button type="submit" className={buttonClasses.primary}>Save Inspection</button>
                </div>
            </div>
        </form>
    );
};

const WaslaLogo: React.FC = () => (
    <div className="text-center">
        <h2 className="text-2xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-500">
            WASLA
        </h2>
        <p className="text-xs font-semibold tracking-wide text-teal-700 dark:text-teal-400">
            Property Solutions
        </p>
    </div>
);


const ReportTemplate: React.FC<{ inspection: InspectionData }> = ({ inspection }) => {
    // This component is now only used for the hidden print view.
    // PDF generation is handled programmatically by WaslaReportGenerator.
    const Watermark = () => (
      <div className="absolute inset-0 flex items-center justify-center -z-10" aria-hidden="true">
        <div className="text-gray-200/60 dark:text-gray-700/40 opacity-50 select-none transform -rotate-45 scale-150">
          <WaslaLogo />
        </div>
      </div>
    );

    return (
        <div className="print:block hidden">
            {/* Page 1 */}
            <div className="printable-a4 bg-white dark:bg-gray-800 p-8 text-sm break-after-page relative">
                <Watermark />
                <header className="flex justify-center items-center flex-col mb-8">
                    <WaslaLogo />
                </header>
                
                <div className="flex space-x-8">
                    {/* English Column */}
                    <div className="w-1/2 space-y-3 text-justify">
                        <h2 className="font-bold text-base text-center uppercase">OVERVIEW</h2>
                        <p><span className="font-bold">Dear Mr. {inspection.clientName},</span></p>
                        <p>Thank you for choosing Wasla Real Estate Solutions to carry out the inspection of your property. This report presents the inspection findings and measurements as documented on site on the date of the visit, and the presence of certain observations is common in property inspections.</p>
                        <p>Please review the attached report carefully before making your final decision. If you require any further clarification regarding the condition of the property, please feel free to contact us by phone or email between 9:00 a.m. and 5:00 p.m.</p>
                        <p className="text-left dir-ltr">Email: info@waslaoman.com</p>
                        <p className="text-left dir-ltr">Mobile: +968 90699799</p>

                        <section className="pt-2">
                            <h3 className="font-bold">No property is perfect.</h3>
                            <p>Every building has imperfections or items that are ready for maintenance. It’s the inspector’s task to discover and report these so you can make informed decisions. This report should not be used as a tool to demean property, but rather as a way to illuminate the realities of the property.</p>
                        </section>
                        
                        <section className="pt-2">
                             <h3 className="font-bold">This report is not an appraisal.</h3>
                             <p>When an appraiser determines worth, only the most obvious conditions of a property are taken into account to establish a safe loan amount. In effect, the appraiser is representing the interests of the lender. Home inspectors focus more on the interests of the prospective buyer; and, although inspectors must be careful not to make any statements relating to property value, their findings can help buyers more completely understand the true costs of ownership.</p>
                        </section>
                    </div>

                    {/* Arabic Column */}
                    <div className="w-1/2 space-y-3 text-right" dir="rtl">
                       <h2 className="font-bold text-base text-center">نظرة عامة</h2>
                        <p><span className="font-bold">الأفاضل/ {inspection.clientName} المحترمون،</span></p>
                        <p>نشكر لكم اختياركم "وصلة للحلول العقارية" للقيام بفحص العقار الخاص بكم. يُقدم هذا التقرير نتائج الفحص والقياسات كما تم توثيقها ميدانيًا في تاريخ الزيارة، ووجود بعض الملاحظات يُعد أمر شائع في عمليات الفحص العقاري.</p>
                        <p>يرجى مراجعة التقرير المرفق بعناية قبل اتخاذ قراركم النهائي، و إذا كنتم بحاجة إلى توضيحات إضافية حول حالة العقار، فلا تترددوا بالتواصل معنا عبر الهاتف أو البريد الإلكتروني من الساعة 9 صباحًا حتى 5 مساءً على وسائل التواصل التالية:</p>
                        <p>البريد الإلكتروني: info@waslaoman.com</p>
                        <p>الهاتف: +968 90699799</p>
                        
                         <section className="pt-2">
                            <h3 className="font-bold">لا يوجد عقار مثالي</h3>
                            <p>كل عقار يحتوي على بعض العيوب أو الأجزاء التي تحتاج إلى صيانة. دور المفتش هو تحديد هذه النقاط وتقديمها بوضوح لمساعدتكم في اتخاذ قرارات مستنيرة. هذا التقرير لا يُقصد به التقليل من قيمة العقار، وإنما يهدف إلى توضيح الحالة الواقعية له.</p>
                        </section>

                        <section className="pt-2">
                             <h3 className="font-bold">هذا التقرير ليس تقييمًا سعريًا</h3>
                             <p>عند قيام المثمن بتحديد قيمة العقار، فإنه يأخذ بعين الاعتبار فقط العيوب الظاهرة لتقدير مبلغ قرض آمن. بمعنى آخر، فإن المثمن يُمثل مصلحة الجهة المُقرضة. أما فاحص العقار، فيركز على مصلحة المشتري المحتمل. ورغم أن المفتش لا يحدد قيمة العقار، إلا أن نتائج الفحص تساعد المشتري في فهم التكاليف الحقيقية لامتلاك العقار.</p>
                        </section>
                    </div>
                </div>
            </div>

            {/* Page 2 */}
            <div className="printable-a4 bg-white dark:bg-gray-800 p-8 text-sm break-after-page relative">
                <Watermark />
                 <div className="flex space-x-8">
                    {/* English Column */}
                    <div className="w-1/2 space-y-3 text-justify">
                        <section className="pt-2">
                            <h3 className="font-bold">Maintenance costs are normal.</h3>
                            <p>Homeowners should plan to spend around 1% of the total value of a property in maintenance costs, annually. (Annual costs of rental property maintenance are often 2%, or more.) If considerably less than this percentage has been invested during several years preceding an inspection, the property will usually show the obvious signs of neglect; and the new property owners may be required to invest significant time and money to address accumulated maintenance needs.</p>
                        </section>
                        
                        <section className="pt-2">
                             <h3 className="font-bold">SCOPE OF THE INSPECTION:</h3>
                             <p>This report details the outcome of a visual survey of the property detailed in the annexed inspection checklist in order to check the quality of workmanship against applicable standards. It covers both the interior and the exterior of the property as well as garden, driveway and garage if relevant. Areas not inspected, for whatever reason, cannot guarantee that these areas are free from defects.</p>
                             <p>This report was formed as per the client request as a supportive opinion to enable him to have better understanding about property conditions. Our opinion does not study the property value or the engineering of the structure rather it studies the functionality of the property. This report will be listing the property defects supported by images and videos, by showing full study of the standards of property status and functionality including other relevant elements of the property as stated in the checklist.</p>
                        </section>

                         <section className="pt-2">
                            <h3 className="font-bold">CONFIDENTIALITY OF THE REPORT:</h3>
                            <p>The inspection report is to be prepared for the Client for the purpose of informing of the major deficiencies in the condition of the subject property and is solely and exclusively for Client’s own information and may not be relied upon by any other person. Client may distribute copies of the inspection report to the seller and the real estate agents directly involved in this transaction, but Client and Inspector do not in any way intend to benefit said seller or the real estate agents directly or indirectly through this Agreement or the inspection report. In the event that the inspection report has been prepared for the SELLER of the subject property, an authorized representative of Wasla Real Estate Solutions will return to the property, for a fee, to meet with the BUYER for a consultation to provide a better understanding of the reported conditions and answer.</p>
                        </section>
                    </div>

                    {/* Arabic Column */}
                    <div className="w-1/2 space-y-3 text-right" dir="rtl">
                        <section className="pt-2">
                            <h3 className="font-bold">تكاليف الصيانة أمر طبيعي</h3>
                            <p>ينبغي على مالكي العقارات تخصيص ما يُعادل 1% من قيمة العقار سنويًا لأعمال الصيانة الدورية. أما العقارات المؤجرة فقد تصل النسبة إلى 2% أو أكثر. وإذا لم يتم استثمار هذه النسبة على مدى عدة سنوات، فستظهر مؤشرات واضحة على الإهمال، مما يُحتم على المالك الجديد دفع تكاليف كبيرة لاحقًا لمعالجة هذه الإهمالات.</p>
                        </section>
                         <section className="pt-2">
                             <h3 className="font-bold">نطاق الفحص</h3>
                             <p>يوضح هذا التقرير نتيجة الفحص البصري للعقار كما هو مفصل في قائمة الفحص المرفقة، بهدف تقييم جودة التنفيذ مقارنة بالمعايير المعتمدة. يشمل الفحص المناطق الداخلية والخارجية، بالإضافة إلى الحديقة، والممر، والجراج ( إن وُجد). كما لا يمكن ضمان خلو المناطق غير المفحوصة من العيوب لأي سببٍ كان.</p>
                             <p>وقد تم إعداد هذا التقرير بناءً على طلب العميل لتقديم رأي داعم يساعده على فهم حالة العقار بشكل أفضل. رأينا الفني لا يشمل تقييم القيمة السوقية أو التحليل الإنشائي، بل يركز على حالة العقار ووظائفه العامة. كما سيتم سرد العيوب المرصودة بناءً على دراسة كاملة لمعايير الحالة والأداء الوظيفي للعقار مشمولة بالصور والفيديوهات، إلى جانب العناصر الأخرى ذات الصلة كما هو موضح في قائمة الفحص.</p>
                        </section>
                        <section className="pt-2">
                            <h3 className="font-bold">سرية التقرير</h3>
                            <p>تم إعداد تقرير الفحص هذا خصيصًا للعميل بغرض إعلامه بالنواقص الجوهرية في حالة العقار محل الفحص، وهو للاستخدام الشخصي فقط ولا يجوز الاعتماد عليه من قبل أي طرف آخر. يجوز للعميل مشاركة نسخة من التقرير مع البائع أو وكلاء العقارات المعنيين بهذه الصفقة، إلا أن كل من العميل والفاحص لا يقصدان من خلال هذا التقرير تحقيق أي منفعة مباشرة أو غير مباشرة لهؤلاء الأطراف. وفي حال تم إعداد هذا التقرير بطلب من البائع، فإن ممثلًا معتمدًا من شركة وصلة لحلول العقار سيعود إلى العقار – مقابل رسوم – لعقد جلسة استشارية مع المشتري بهدف توضيح الملاحظات الواردة في التقرير والإجابة عن استفساراته.</p>
                        </section>
                    </div>
                </div>
                
                <div className="mt-8 pt-4 border-t dark:border-gray-600 flex justify-between">
                    <div className="w-1/2 space-y-2">
                        <p><strong>Client Name:</strong> {inspection.clientName}</p>
                        <p><strong>Signature:</strong> ________________________</p>
                        <p><strong>Prepared by:</strong> {inspection.inspectorName}</p>
                        <p><strong>Stamp:</strong></p>
                        <p><strong>Date:</strong> {formatDate(inspection.inspectionDate)}</p>
                        <p className="mt-4">Property Inspection report is annexed</p>
                        <p className="text-xs pt-4">Wasla Property Solutions CR. 1068375</p>
                    </div>
                     <div className="w-1/2 space-y-2 text-right" dir="rtl">
                        <p><strong>اسم العميل:</strong> {inspection.clientName}</p>
                        <p><strong>التوقيع:</strong> ________________________</p>
                        <p><strong>أعد التقرير بواسطة:</strong> {inspection.inspectorName}</p>
                        <p><strong>الختم:</strong></p>
                        <p><strong>التاريخ:</strong> {formatDate(inspection.inspectionDate)}</p>
                        <p className="mt-4">مرفق تقرير الفحص</p>
                        <p className="text-xs pt-4">وصلة للحلول العقارية س ت 1068375</p>
                    </div>
                </div>
            </div>
        </div>
    );
};


const InspectionReport: React.FC<{ inspectionId: string; onBack: () => void, onEdit: (id: string) => void }> = ({ inspectionId, onBack, onEdit }) => {
    const { getInspectionById } = useInspections();
    const [inspection, setInspection] = useState<InspectionData | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        setInspection(getInspectionById(inspectionId));
    }, [inspectionId]);
    
    const handleExportPDF = async () => {
        if (!inspection) {
            alert("Inspection data not loaded yet.");
            return;
        }

        setIsExporting(true);
        try {
            const reportGenerator = new WaslaReportGenerator();
            await reportGenerator.initialize();
            
            const pdf = await reportGenerator.generateReport(inspection);

            const clientName = inspection.clientName.replace(/\s/g, '_') || 'Report';
            const date = new Date().toISOString().split('T')[0];
            const filename = `Wasla-Report-${clientName}-${date}.pdf`;
            
            pdf.save(filename);
            
        } catch (error) {
            console.error('PDF Export Error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            alert(`Failed to generate PDF: ${errorMessage}`);
        } finally {
            setIsExporting(false);
        }
    };


    if (!inspection) return <div className="text-center p-8 text-slate-600 dark:text-slate-400">Report not found.</div>;

    const statusBadgeClasses: { [key in InspectionStatus]: string } = {
        'Pass': 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
        'Fail': 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
        'N/A': 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    };
    
    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-6 print:hidden">
                <button onClick={onBack} className={buttonClasses.secondary}>&larr; Back to Inspections</button>
                <div className="flex gap-2">
                    <button onClick={() => onEdit(inspectionId)} className={buttonClasses.secondary}>Edit</button>
                    <button onClick={handleExportPDF} disabled={isExporting} className={`${buttonClasses.primary} flex items-center gap-2 bg-orange-500 hover:bg-orange-600`}>
                        {isExporting ? <><Spinner /> Exporting...</> : 'Export to PDF'}
                    </button>
                </div>
            </div>

            <div id="full-report-container">
                <ReportTemplate inspection={inspection} />
                <div id="report-content" className="bg-white dark:bg-slate-900 p-8 rounded-xl shadow-lg border dark:border-slate-800 printable-a4">
                     <header className="flex justify-between items-start border-b-2 border-slate-200 dark:border-slate-800 pb-4 mb-6">
                        <div className="flex-shrink-0">
                           <WaslaLogo />
                        </div>
                        <div className="text-right">
                            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Inspection Report</h1>
                            <p className="text-md text-slate-600 dark:text-slate-300">{inspection.propertyLocation}</p>
                        </div>
                    </header>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mb-8 text-sm p-4 bg-slate-50 dark:bg-slate-800/30 rounded-lg">
                        <div className="flex justify-between"><strong className="text-slate-500 dark:text-slate-400">Client:</strong> <span className="text-slate-800 dark:text-slate-200 font-medium">{inspection.clientName}</span></div>
                        <div className="flex justify-between"><strong className="text-slate-500 dark:text-slate-400">Inspector:</strong> <span className="text-slate-800 dark:text-slate-200 font-medium">{inspection.inspectorName}</span></div>
                        <div className="flex justify-between"><strong className="text-slate-500 dark:text-slate-400">Date:</strong> <span className="text-slate-800 dark:text-slate-200 font-medium">{formatDate(inspection.inspectionDate)}</span></div>
                         <div className="flex justify-between"><strong className="text-slate-500 dark:text-slate-400">Property Type:</strong> <span className="text-slate-800 dark:text-slate-200 font-medium">{inspection.propertyType}</span></div>
                    </div>

                    <div className="mb-8 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center mb-2">
                            <svg className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Executive Summary</h2>
                        </div>
                        {inspection.aiSummary ? (
                            <div className="prose prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 whitespace-pre-wrap ml-9">{inspection.aiSummary}</div>
                        ) : (
                            <p className="text-slate-500 dark:text-slate-400 italic ml-9">No summary was generated for this report.</p>
                        )}
                    </div>

                    {inspection.areas.map(area => (
                        <div key={area.id} className="mb-8 break-inside-avoid">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 pb-2 mb-4 border-b-2 border-blue-500">{area.name}</h3>
                            <div className="space-y-4">
                               {area.items.length > 0 ? area.items.map(item => (
                                   <div key={item.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 break-inside-avoid-page bg-white dark:bg-slate-900/50 shadow-sm">
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex-1 pr-4">{item.point}</h4>
                                            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${statusBadgeClasses[item.status]} flex-shrink-0`}>{item.status}</span>
                                        </div>
                                        {(item.location || item.comments) && (
                                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                                                {item.location && <p className="text-sm text-slate-600 dark:text-slate-300"><strong className="font-semibold text-slate-700 dark:text-slate-200">Location:</strong> {item.location}</p>}
                                                {item.comments && <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap"><strong className="font-semibold text-slate-700 dark:text-slate-200">Comments:</strong> {item.comments}</p>}
                                            </div>
                                        )}
                                       {item.photos.length > 0 && (
                                           <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                               {item.photos.map((photo, index) => (
                                                   <a key={index} href={`data:image/jpeg;base64,${photo.base64}`} target="_blank" rel="noopener noreferrer" className="group">
                                                        <img src={`data:image/jpeg;base64,${photo.base64}`} alt={`${item.point} photo ${index+1}`} className="rounded-lg w-full aspect-square object-cover group-hover:opacity-80 transition-opacity"/>
                                                   </a>
                                               ))}
                                           </div>
                                       )}
                                   </div>
                               )) : <p className="p-4 text-slate-500 dark:text-slate-400">No items inspected in this area.</p>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
             <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 0;
                    }
                    body { -webkit-print-color-adjust: exact; color-adjust: exact; }
                    .print\\:hidden { display: none !important; }
                    .print\\:block { display: block !important; }
                    html, body {
                        background-color: #fff !important;
                        color: #000 !important;
                    }
                    #report-content, #invoice-content, .printable-a4 {
                        box-shadow: none !important;
                        border: none !important;
                        color: #000 !important;
                        background-color: #fff !important;
                        margin: 0;
                        padding: 20mm;
                        width: 210mm;
                        min-height: 297mm;
                        box-sizing: border-box;
                    }
                    .dark * {
                        color: #000 !important;
                        background-color: transparent !important;
                        border-color: #ccc !important;
                    }
                    .break-inside-avoid-page { page-break-inside: avoid; }
                    .break-after-page { page-break-after: always; }
                }
                .printable-a4 {
                    width: 210mm;
                    min-height: 297mm;
                    padding: 20mm;
                    margin: 1rem auto;
                    box-sizing: border-box;
                    position: relative;
                    z-index: 0;
                }
            `}</style>
        </div>
    );
};

const InspectionsDashboard: React.FC<{ onView: (id: string) => void; onEdit: (id: string) => void; onCreate: () => void; }> = ({ onView, onEdit, onCreate }) => {
    const { getInspections, deleteInspection } = useInspections();
    const [inspections, setInspections] = useState<InspectionData[]>([]);
    const [filter, setFilter] = useState<string>('All');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        setInspections(getInspections());
    }, []);

    const handleDeleteRequest = (id: string) => {
        setDeletingId(id);
    };

    const confirmDelete = () => {
        if (deletingId) {
            deleteInspection(deletingId);
            setInspections(getInspections());
            setDeletingId(null);
        }
    };

    const filteredInspections = inspections.filter(insp => filter === 'All' || insp.propertyType === filter);
    
    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                 <div className="flex items-center gap-4 w-full sm:w-auto">
                     <div className="flex-grow">
                        <label htmlFor="propertyTypeFilter" className="sr-only">Filter by property type</label>
                        <select
                            id="propertyTypeFilter"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className={inputClasses}
                        >
                            <option value="All">All Property Types</option>
                            <option value="Apartment">Apartment</option>
                            <option value="Villa">Villa</option>
                            <option value="Building">Building</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>
                <button onClick={onCreate} className={buttonClasses.primary}>
                    New Inspection
                </button>
            </div>
            
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border dark:border-slate-800">
                {filteredInspections.length > 0 ? (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredInspections.map(insp => (
                            <li key={insp.id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <div>
                                    <h3 className="font-semibold text-lg text-blue-700 dark:text-blue-400">{insp.propertyLocation}</h3>
                                    <p className="text-slate-600 dark:text-slate-300">Client: {insp.clientName}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Date: {formatDate(insp.inspectionDate)} | Type: {insp.propertyType}</p>
                                </div>
                                <div className="flex gap-2 self-end md:self-center">
                                    <button onClick={() => onView(insp.id)} className={buttonClasses.secondary}>View Report</button>
                                     <button onClick={() => onEdit(insp.id)} className="bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-300 font-semibold py-2 px-4 rounded-lg text-sm transition-colors">Edit</button>
                                    <button onClick={() => handleDeleteRequest(insp.id)} className="bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900 text-red-800 dark:text-red-300 font-semibold py-2 px-4 rounded-lg text-sm transition-colors">Delete</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-center p-12 text-slate-500 dark:text-slate-400">
                        <h3 className="text-xl font-semibold">No inspections found.</h3>
                        <p>{filter === 'All' ? 'Click "New Inspection" to get started.' : `No inspections match the filter "${filter}".`}</p>
                    </div>
                )}
            </div>
            <ConfirmationModal
                isOpen={!!deletingId}
                onClose={() => setDeletingId(null)}
                onConfirm={confirmDelete}
                title="Delete Inspection"
                message="Are you sure you want to delete this inspection? This action cannot be undone."
                confirmText="Delete"
            />
        </div>
    );
};

const PlaceholderPage: React.FC<{title: string}> = ({title}) => (
    <div className="flex items-center justify-center h-full">
        <div className="text-center p-12 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl shadow-sm border dark:border-slate-800">
            <h3 className="text-2xl font-semibold">{title}</h3>
            <p>This section is under construction. Check back soon!</p>
        </div>
    </div>
);

// --- New Dashboard Components ---
const StatCard: React.FC<{ title: string; value: string; change: string; changeType: 'increase' | 'decrease', icon: React.ReactNode, color: string }> = ({ title, value, change, changeType, icon, color }) => {
    const isIncrease = changeType === 'increase';
    return (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-5">
            <div className={`flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full ${color}`}>
                {icon}
            </div>
            <div>
                <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h4>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
                {change && (
                     <div className={`text-sm flex items-center mt-1 ${isIncrease ? 'text-green-500' : 'text-red-500'}`}>
                        {isIncrease ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        )}
                        {change}
                    </div>
                )}
            </div>
        </div>
    );
};

const Dashboard: React.FC = () => {
    const { getInspections } = useInspections();
    const { getInvoices } = useInvoices();
    const { getClients } = useClients();

    const [inspections, setInspections] = useState<InspectionData[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [clients, setClients] = useState<Client[]>([]);

    useEffect(() => {
        setInspections(getInspections());
        setInvoices(getInvoices());
        setClients(getClients());
    }, []);

    const dashboardData = React.useMemo(() => {
        const now = new Date();
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);

        // --- Stat Cards Data ---
        const totalInspections = inspections.length;
        const inspectionsThisMonth = inspections.filter(i => new Date(i.inspectionDate) >= oneMonthAgo).length;

        const paidInvoices = invoices.filter(i => i.status === 'Paid');
        const totalRevenue = paidInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
        const revenueThisMonth = paidInvoices
            .filter(i => new Date(i.invoiceDate) >= oneMonthAgo)
            .reduce((sum, i) => sum + i.totalAmount, 0);

        const totalClients = clients.length;
        const overdueInvoicesCount = invoices.filter(i => i.status === 'Unpaid' && new Date(i.dueDate) < now).length;

        // --- Pie Chart Data ---
        const invoiceStatusCounts = invoices.reduce((acc, inv) => {
            acc[inv.status] = (acc[inv.status] || 0) + 1;
            return acc;
        }, {} as Record<InvoiceStatus, number>);
        
        const pieChartLabels = Object.keys(invoiceStatusCounts);
        const pieChartDataPoints = pieChartLabels.map(label => invoiceStatusCounts[label as InvoiceStatus]);


        // --- Bar Chart Data ---
        const monthlyRevenue: { [key: string]: { name: string; total: number } } = {};
        for(let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = d.toLocaleString('default', { month: 'short' });
            const year = d.getFullYear();
            monthlyRevenue[`${year}-${monthName}`] = { name: `${monthName} '${String(year).slice(-2)}`, total: 0 };
        }

        paidInvoices.forEach(inv => {
            const invDate = new Date(inv.invoiceDate);
            const monthName = invDate.toLocaleString('default', { month: 'short' });
            const year = invDate.getFullYear();
            const key = `${year}-${monthName}`;
            if (monthlyRevenue[key]) {
                monthlyRevenue[key].total += inv.totalAmount;
            }
        });
        const barChartLabels = Object.values(monthlyRevenue).map(m => m.name);
        const barChartDataPoints = Object.values(monthlyRevenue).map(m => m.total);

        return {
            totalInspections,
            inspectionsThisMonth,
            totalRevenue,
            revenueThisMonth,
            totalClients,
            overdueInvoicesCount,
            pieChartLabels,
            pieChartDataPoints,
            barChartLabels,
            barChartDataPoints,
        };
    }, [inspections, invoices, clients]);

    const isDarkMode = document.documentElement.classList.contains('dark');
    const textColor = isDarkMode ? '#e5e7eb' : '#374151';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    const barChartData = {
        labels: dashboardData.barChartLabels,
        datasets: [{
            label: 'Revenue',
            data: dashboardData.barChartDataPoints,
            backgroundColor: 'rgba(59, 130, 246, 0.8)', // blue-500
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 1,
            borderRadius: 6,
        }],
    };
    
    const pieChartData = {
        labels: dashboardData.pieChartLabels,
        datasets: [{
            data: dashboardData.pieChartDataPoints,
            backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#6b7280'], // emerald, red, amber, slate
            borderColor: isDarkMode ? '#0f172a' : '#ffffff', // slate-900 for dark
            borderWidth: 4,
        }],
    };

    const chartOptions = (title: string) => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: false },
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: { color: textColor },
                grid: { color: gridColor },
            },
            x: {
                ticks: { color: textColor },
                grid: { display: false },
            },
        },
    });
    
    const pieOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { color: textColor },
        },
      },
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                 <StatCard 
                    title="Total Inspections" 
                    value={dashboardData.totalInspections.toString()} 
                    change={`+${dashboardData.inspectionsThisMonth} this month`} 
                    changeType="increase"
                    color="bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300"
                    icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
                 />
                <StatCard 
                    title="Total Revenue" 
                    value={formatCurrency(dashboardData.totalRevenue, 'OMR')} 
                    change={`+${formatCurrency(dashboardData.revenueThisMonth, '')} this month`} 
                    changeType="increase" 
                    color="bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-300"
                    icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>}
                />
                <StatCard 
                    title="Active Clients" 
                    value={dashboardData.totalClients.toString()} 
                    change="" 
                    changeType="increase"
                    color="bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-300"
                    icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                />
                <StatCard 
                    title="Overdue Invoices" 
                    value={dashboardData.overdueInvoicesCount.toString()} 
                    change="" 
                    changeType="decrease"
                    color="bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300"
                    icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Revenue Overview</h3>
                    <div className="h-72">
                        <Bar options={chartOptions('Revenue Overview')} data={barChartData} />
                    </div>
                </div>
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Invoice Status</h3>
                     <div className="h-72">
                        <Pie data={pieChartData} options={pieOptions} />
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- New Client Management Components ---
const ClientFormModal: React.FC<{ client?: Client; onClose: () => void; onSave: (client: Client) => void; }> = ({ client, onClose, onSave }) => {
    const [formData, setFormData] = useState<Client>(client || { id: `client_${Date.now()}`, name: '', email: '', phone: '', address: '', properties: [] });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handlePropertyChange = (index: number, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const newProperties = [...formData.properties];
        const property = newProperties[index];
        const { name, value } = e.target;
        (property as any)[name] = name === 'size' ? parseFloat(value) : value;
        setFormData({ ...formData, properties: newProperties });
    };

    const addProperty = () => {
        const newProperty: Property = { id: `prop_${Date.now()}`, location: '', type: 'Residential', size: 0 };
        setFormData({ ...formData, properties: [...formData.properties, newProperty] });
    };

    const removeProperty = (index: number) => {
        setFormData({ ...formData, properties: formData.properties.filter((_, i) => i !== index) });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={client ? "Edit Client" : "Add New Client"} size="xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input name="name" value={formData.name} onChange={handleChange} placeholder="Client Name" required className={inputClasses} />
                    <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Email Address" required className={inputClasses} />
                    <input name="phone" value={formData.phone} onChange={handleChange} placeholder="Phone Number" className={inputClasses} />
                </div>
                <textarea name="address" value={formData.address} onChange={handleChange} placeholder="Client Address" rows={3} className={inputClasses}></textarea>
                
                <div className="border-t dark:border-slate-700 pt-4">
                    <h4 className="font-semibold mb-2 text-slate-800 dark:text-slate-200">Properties</h4>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                        {formData.properties.map((prop, index) => (
                            <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
                                <input name="location" value={prop.location} onChange={(e) => handlePropertyChange(index, e)} placeholder="Location" required className={`${inputClasses} md:col-span-2`} />
                                <input name="size" type="number" value={prop.size} onChange={(e) => handlePropertyChange(index, e)} placeholder="Size (sqm)" required className={inputClasses} />
                                <div className="flex items-center gap-2">
                                    <select name="type" value={prop.type} onChange={(e) => handlePropertyChange(index, e)} className={`${inputClasses} flex-grow`}>
                                        <option value="Residential">Residential</option>
                                        <option value="Commercial">Commercial</option>
                                    </select>
                                    <button type="button" onClick={() => removeProperty(index)} className="text-red-500 hover:text-red-700 text-2xl transition-colors">&times;</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addProperty} className="mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-semibold transition-colors">+ Add Property</button>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={onClose} className={buttonClasses.secondary}>Cancel</button>
                    <button type="submit" className={buttonClasses.primary}>Save Client</button>
                </div>
            </form>
        </Modal>
    );
};

const ClientsPage: React.FC<{}> = ({}) => {
    const { getClients, saveClient, deleteClient } = useClients();
    const [clients, setClients] = useState<Client[]>([]);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        setClients(getClients());
    }, []);

    const handleSave = (client: Client) => {
        saveClient(client);
        setClients(getClients());
    };

    const handleDeleteRequest = (id: string) => {
        setDeletingId(id);
    };

    const confirmDelete = () => {
        if (deletingId) {
            deleteClient(deletingId);
            setClients(getClients());
            setDeletingId(null);
        }
    };
    
    const openModal = (client: Client | null = null) => {
        setEditingClient(client);
        setIsModalOpen(true);
    };

    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className={`${inputClasses} w-full sm:w-72`}
                />
                <button onClick={() => openModal()} className={buttonClasses.primary}>
                    Add New Client
                </button>
            </div>

            {isModalOpen && <ClientFormModal client={editingClient || undefined} onClose={() => setIsModalOpen(false)} onSave={handleSave} />}

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border dark:border-slate-800">
                {filteredClients.length > 0 ? (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredClients.map(client => (
                            <li key={client.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-semibold text-lg text-blue-700 dark:text-blue-400">{client.name}</h3>
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            <span className="flex items-center gap-1.5">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                {client.email}
                                            </span>
                                            {client.phone &&
                                                <span className="flex items-center gap-1.5 mt-1 sm:mt-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                                    {client.phone}
                                                </span>
                                            }
                                        </div>
                                    </div>
                                    <div className="flex gap-2 self-start flex-shrink-0">
                                        <button onClick={() => openModal(client)} className="bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-300 font-semibold py-1 px-3 rounded-lg text-sm transition-colors">Edit</button>
                                        <button onClick={() => handleDeleteRequest(client.id)} className="bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900 text-red-800 dark:text-red-300 font-semibold py-1 px-3 rounded-lg text-sm transition-colors">Delete</button>
                                    </div>
                                </div>
                                {client.properties.length > 0 &&
                                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                                        <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Properties</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {client.properties.map(p => (
                                                <div key={p.id} className="bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1 text-xs flex items-center gap-2">
                                                    <span className={`font-bold ${p.type === 'Residential' ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}>{p.type}</span>
                                                    <span className="text-slate-700 dark:text-slate-300">{p.location}</span>
                                                    <span className="text-slate-500 dark:text-slate-400">({p.size} sqm)</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                }
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-center p-12 text-slate-500 dark:text-slate-400">
                        <h3 className="text-xl font-semibold">No clients found.</h3>
                        {searchTerm ? 
                            <p>Your search for "{searchTerm}" did not return any results.</p> : 
                            <p>Click "Add New Client" to get started.</p>
                        }
                    </div>
                )}
            </div>
            <ConfirmationModal
                isOpen={!!deletingId}
                onClose={() => setDeletingId(null)}
                onConfirm={confirmDelete}
                title="Delete Client"
                message="Are you sure you want to delete this client and all their properties? This action is permanent."
                confirmText="Delete"
            />
        </div>
    );
};

// --- New Invoice Management Components ---
const InvoicesDashboard: React.FC<{ onView: (id: string) => void; onEdit: (id: string) => void; onCreate: () => void; }> = ({ onView, onEdit, onCreate }) => {
    const { getInvoices, deleteInvoice } = useInvoices();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'All'>('All');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        setInvoices(getInvoices());
    }, []);
    
    const handleDeleteRequest = (id: string) => {
        setDeletingId(id);
    };

    const confirmDelete = () => {
        if (deletingId) {
            deleteInvoice(deletingId);
            setInvoices(getInvoices());
            setDeletingId(null);
        }
    };
    
    const filteredInvoices = invoices.filter(inv => {
        const clientMatch = inv.clientName.toLowerCase().includes(searchTerm.toLowerCase());
        const statusMatch = statusFilter === 'All' || inv.status === statusFilter;
        return clientMatch && statusMatch;
    });

    const statusClasses: { [key in InvoiceStatus]: string } = {
        'Paid': 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
        'Unpaid': 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
        'Partial': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
        'Draft': 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    };

    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto flex-grow">
                    <input type="text" placeholder="Search by client..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={`${inputClasses} w-full sm:w-64`} />
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className={inputClasses}>
                        <option value="All">All Statuses</option>
                        <option value="Paid">Paid</option>
                        <option value="Unpaid">Unpaid</option>
                        <option value="Partial">Partial</option>
                        <option value="Draft">Draft</option>
                    </select>
                </div>
                <button onClick={onCreate} className={buttonClasses.primary}>
                    New Invoice
                </button>
            </div>
            
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border dark:border-slate-800 overflow-x-auto">
                {filteredInvoices.length > 0 ? (
                    <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-800 dark:text-slate-400">
                            <tr>
                                <th scope="col" className="p-4 font-semibold">Invoice #</th>
                                <th scope="col" className="p-4 font-semibold">Client</th>
                                <th scope="col" className="p-4 font-semibold">Date</th>
                                <th scope="col" className="p-4 font-semibold">Due Date</th>
                                <th scope="col" className="p-4 font-semibold">Amount</th>
                                <th scope="col" className="p-4 font-semibold">Status</th>
                                <th scope="col" className="p-4 font-semibold text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInvoices.map(inv => (
                                <tr key={inv.id} className="bg-white border-b dark:bg-slate-900 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="p-4 font-medium text-blue-600 dark:text-blue-400">{inv.invoiceNumber}</td>
                                    <td className="p-4 text-slate-900 dark:text-slate-200">{inv.clientName}</td>
                                    <td className="p-4">{formatDate(inv.invoiceDate)}</td>
                                    <td className="p-4">{formatDate(inv.dueDate)}</td>
                                    <td className="p-4 font-mono text-slate-900 dark:text-slate-200">{formatCurrency(inv.totalAmount)}</td>
                                    <td className="p-4"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[inv.status]}`}>{inv.status}</span></td>
                                    <td className="p-4">
                                        <div className="flex gap-4 justify-center">
                                            <button onClick={() => onView(inv.id)} className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="View"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7z" /></svg></button>
                                            <button onClick={() => onEdit(inv.id)} className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Edit"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002 2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                            <button onClick={() => handleDeleteRequest(inv.id)} className="text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Delete"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="text-center p-12 text-slate-500 dark:text-slate-400">
                        <h3 className="text-xl font-semibold">No invoices found.</h3>
                        <p>Click "New Invoice" to create one.</p>
                    </div>
                )}
            </div>
             <ConfirmationModal
                isOpen={!!deletingId}
                onClose={() => setDeletingId(null)}
                onConfirm={confirmDelete}
                title="Delete Invoice"
                message="Are you sure you want to delete this invoice? This action cannot be undone."
                confirmText="Delete"
            />
        </div>
    );
};

const TemplateSelector: React.FC<{
    selected: string;
    onChange: (template: 'classic' | 'modern' | 'compact') => void;
}> = ({ selected, onChange }) => {
    const templates = [
        { id: 'classic', name: 'Classic', description: 'A traditional, professional layout.' },
        { id: 'modern', name: 'Modern', description: 'Clean, minimalist design with a splash of color.' },
        { id: 'compact', name: 'Compact', description: 'Fits more information on a single page.' },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {templates.map(template => (
                <div
                    key={template.id}
                    onClick={() => onChange(template.id as any)}
                    className={`p-4 border-2 rounded-xl cursor-pointer transition ${
                        selected === template.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-300 dark:border-slate-700 hover:border-blue-400'
                    }`}
                >
                    <div className="flex items-center justify-between">
                         <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100">{template.name}</h4>
                         {selected === template.id && (
                             <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                         )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{template.description}</p>
                </div>
            ))}
        </div>
    );
};

const InvoiceForm: React.FC<{ invoiceId?: string; onSave: () => void; onCancel: () => void; }> = ({ invoiceId, onSave, onCancel }) => {
    const { getInvoiceById, saveInvoice } = useInvoices();
    const { getClients } = useClients();
    const [clients, setClients] = useState<Client[]>([]);
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [isServiceMenuOpen, setIsServiceMenuOpen] = useState(false);
    const serviceMenuRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        setClients(getClients());
        const getLocalDateString = (date: Date): string => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const today = new Date();
        const dueDate = new Date();
        dueDate.setDate(today.getDate() + 14);

        const invoiceData = invoiceId ? getInvoiceById(invoiceId) : {
            id: `inv_${Date.now()}`,
            invoiceNumber: `INV-${String(Date.now()).slice(-6)}`,
            invoiceDate: getLocalDateString(today),
            dueDate: getLocalDateString(dueDate),
            clientId: '',
            clientName: '', clientAddress: '', clientEmail: '',
            propertyLocation: '',
            services: [],
            subtotal: 0, tax: 0, totalAmount: 0, amountPaid: 0,
            status: 'Draft',
            template: 'classic',
        };
        setInvoice(invoiceData as Invoice);
    }, [invoiceId]);

    useEffect(() => {
        if (!invoice) return;
        const subtotal = invoice.services.reduce((acc, item) => acc + item.total, 0);
        const tax = subtotal * 0.05; // 5% tax
        const totalAmount = subtotal + tax;
        setInvoice(inv => inv ? ({ ...inv, subtotal, tax, totalAmount }) : null);
    }, [invoice?.services]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (serviceMenuRef.current && !serviceMenuRef.current.contains(event.target as Node)) {
                setIsServiceMenuOpen(false);
            }
        };
        if (isServiceMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isServiceMenuOpen]);


    const handleFieldChange = (field: keyof Invoice, value: any) => {
        setInvoice(inv => inv ? ({ ...inv, [field]: value }) : null);
    };

    const handleClientChange = (clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            setInvoice(inv => inv ? ({
                ...inv,
                clientId: client.id,
                clientName: client.name,
                clientAddress: client.address,
                clientEmail: client.email,
                propertyLocation: '',
                services: [],
            }) : null);
        }
    };
    
    const handlePropertySelect = (property: Property) => {
        const rate = property.type === 'Commercial' ? 2 : 1;
        const inspectionService: InvoiceServiceItem = {
            id: `svc_${Date.now()}`,
            description: `${property.type} property inspection at ${property.location}`,
            quantity: property.size,
            unitPrice: rate,
            total: property.size * rate,
        };
        setInvoice(inv => inv ? ({
            ...inv,
            propertyLocation: property.location,
            services: [inspectionService],
        }) : null);
    };
    
    const handleServiceChange = (index: number, field: keyof InvoiceServiceItem, value: string | number) => {
         if (!invoice) return;
         const updatedServices = [...invoice.services];
         const service = { ...updatedServices[index], [field]: value };
         if (field === 'quantity' || field === 'unitPrice') {
             service.total = service.quantity * service.unitPrice;
         }
         updatedServices[index] = service;
         handleFieldChange('services', updatedServices);
    };
    
    const addService = () => {
        const newItem: InvoiceServiceItem = { id: `svc_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, total: 0 };
        handleFieldChange('services', [...(invoice?.services || []), newItem]);
    };

    const handleAddCustomService = () => {
        addService();
        setIsServiceMenuOpen(false);
    };

    const handleAddPredefinedService = (service: PredefinedService) => {
        const newItem: InvoiceServiceItem = {
            id: `svc_${Date.now()}`,
            description: service.description,
            quantity: 1,
            unitPrice: service.unitPrice,
            total: 1 * service.unitPrice,
        };
        handleFieldChange('services', [...(invoice?.services || []), newItem]);
        setIsServiceMenuOpen(false);
    };
    
    const removeService = (index: number) => {
        handleFieldChange('services', invoice?.services.filter((_, i) => i !== index));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (invoice) {
            saveInvoice(invoice);
            onSave();
        }
    };

    if (!invoice) return <div className="text-center p-8"><Spinner className="text-blue-600 dark:text-blue-400 mx-auto" /></div>;

    const selectedClient = clients.find(c => c.id === invoice.clientId);

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
             <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border dark:border-slate-800">
                <h3 className="text-xl font-semibold mb-4 text-slate-800 dark:text-slate-100">Invoice Template</h3>
                <TemplateSelector selected={invoice.template || 'classic'} onChange={(t) => handleFieldChange('template', t)} />
            </div>

             <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border dark:border-slate-800">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Invoice</h2>
                    <input type="text" value={invoice.invoiceNumber} onChange={e => handleFieldChange('invoiceNumber', e.target.value)} className={`${inputClasses} max-w-xs`} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Bill To</label>
                        <select value={invoice.clientId} onChange={e => handleClientChange(e.target.value)} required className={inputClasses}>
                            <option value="" disabled>Select a client</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {selectedClient && <div className="text-sm mt-2 text-slate-600 dark:text-slate-400">
                            <p>{selectedClient.address}</p>
                            <p>{selectedClient.email}</p>
                        </div>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Property</label>
                        <select 
                            value={invoice.propertyLocation} 
                            onChange={e => {
                                const prop = selectedClient?.properties.find(p => p.location === e.target.value);
                                if (prop) handlePropertySelect(prop);
                            }} 
                            disabled={!selectedClient} 
                            className={inputClasses}
                        >
                            <option value="" disabled>Select property</option>
                            {selectedClient?.properties.map(p => <option key={p.id} value={p.location}>{p.location}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Invoice Date</label>
                        <input type="date" value={invoice.invoiceDate} onChange={e => handleFieldChange('invoiceDate', e.target.value)} className={inputClasses} />
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mt-2 mb-1">Due Date</label>
                        <input type="date" value={invoice.dueDate} onChange={e => handleFieldChange('dueDate', e.target.value)} className={inputClasses} />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border dark:border-slate-800">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b dark:border-slate-700">
                            <tr>
                                <th className="text-left py-2 pr-2">Description</th>
                                <th className="text-right py-2 px-2 w-24">Qty</th>
                                <th className="text-right py-2 px-2 w-32">Unit Price</th>
                                <th className="text-right py-2 pl-2 w-32">Total</th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.services.map((service, index) => (
                                <tr key={service.id}>
                                    <td><input type="text" value={service.description} onChange={e => handleServiceChange(index, 'description', e.target.value)} className={`${inputClasses} my-1`} /></td>
                                    <td><input type="number" value={service.quantity} onChange={e => handleServiceChange(index, 'quantity', parseFloat(e.target.value))} className={`${inputClasses} my-1 text-right`} /></td>
                                    <td><input type="number" value={service.unitPrice} onChange={e => handleServiceChange(index, 'unitPrice', parseFloat(e.target.value))} className={`${inputClasses} my-1 text-right`} /></td>
                                    <td className="text-right font-mono py-2 pl-2">{formatCurrency(service.total)}</td>
                                    <td className="text-center"><button type="button" onClick={() => removeService(index)} className="text-red-500 hover:text-red-700 text-2xl transition-colors">&times;</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="relative inline-block text-left mt-2">
                    <div>
                        <button
                            type="button"
                            onClick={() => setIsServiceMenuOpen(prev => !prev)}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm px-4 py-2 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-900 focus:ring-blue-500"
                        >
                            Add Item
                            <svg className="ml-2 -mr-1 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                    </div>

                    {isServiceMenuOpen && (
                        <div
                            ref={serviceMenuRef}
                            className="origin-top-left absolute left-0 mt-2 w-72 rounded-lg shadow-lg bg-white dark:bg-slate-900 ring-1 ring-black dark:ring-slate-700 ring-opacity-5 focus:outline-none z-10"
                        >
                            <div className="py-1" role="menu" aria-orientation="vertical">
                                {PREDEFINED_SERVICES.map(service => (
                                    <button
                                        type="button"
                                        key={service.name}
                                        onClick={() => handleAddPredefinedService(service)}
                                        className="block w-full text-left px-4 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        role="menuitem"
                                    >
                                       <p className="font-semibold">{service.name}</p>
                                       <p className="text-xs text-slate-500 dark:text-slate-400">{formatCurrency(service.unitPrice)} - {service.description}</p>
                                    </button>
                                ))}
                                <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                                <button
                                    type="button"
                                    onClick={handleAddCustomService}
                                    className="block w-full text-left px-4 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                                    role="menuitem"
                                >
                                    + Add Custom Line Item
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border dark:border-slate-800">
                    <h3 className="font-semibold mb-2">Notes</h3>
                    <textarea value={invoice.notes} onChange={e => handleFieldChange('notes', e.target.value)} rows={4} className={inputClasses} placeholder="Add any notes for the client..."></textarea>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border dark:border-slate-800 flex flex-col justify-between">
                    <div className="space-y-2 text-right">
                        <div className="flex justify-between items-center"><span className="font-semibold">Subtotal:</span> <span className="font-mono">{formatCurrency(invoice.subtotal)}</span></div>
                        <div className="flex justify-between items-center"><span className="font-semibold">Tax (5%):</span> <span className="font-mono">{formatCurrency(invoice.tax)}</span></div>
                        <div className="flex justify-between items-center text-xl font-bold border-t pt-2 dark:border-slate-700"><span className="">Total:</span> <span className="font-mono">{formatCurrency(invoice.totalAmount)}</span></div>
                    </div>
                    <div className="space-y-2 mt-4">
                        <div className="flex items-center gap-4">
                            <label className="font-semibold">Status:</label>
                             <select value={invoice.status} onChange={e => handleFieldChange('status', e.target.value)} className={inputClasses}>
                                <option value="Draft">Draft</option>
                                <option value="Unpaid">Unpaid</option>
                                <option value="Partial">Partial</option>
                                <option value="Paid">Paid</option>
                            </select>
                        </div>
                        {(invoice.status === 'Partial' || invoice.status === 'Paid') &&
                            <div className="flex items-center gap-4">
                               <label className="font-semibold">Amount Paid:</label>
                               <input type="number" value={invoice.amountPaid} onChange={e => handleFieldChange('amountPaid', parseFloat(e.target.value))} className={`${inputClasses} text-right`} />
                            </div>
                        }
                        <div className="flex justify-between items-center text-lg font-semibold bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                            <span>Balance Due:</span>
                            <span className="font-mono">{formatCurrency(invoice.totalAmount - invoice.amountPaid)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-4">
                <button type="button" onClick={onCancel} className={buttonClasses.secondary}>Cancel</button>
                <button type="submit" className={buttonClasses.primary}>Save Invoice</button>
            </div>
        </form>
    );
};

const InvoiceViewer: React.FC<{ invoiceId: string; onBack: () => void; onEdit: (id: string) => void; }> = ({ invoiceId, onBack, onEdit }) => {
    const { getInvoiceById } = useInvoices();
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [html2canvas, setHtml2canvas] = useState<any>(null);

    useEffect(() => {
        setInvoice(getInvoiceById(invoiceId));
        // Dynamically import html2canvas
        import('html2canvas').then(module => setHtml2canvas(() => module.default));
    }, [invoiceId]);
    
    const handleExportPDF = async () => {
        if (!html2canvas) {
            alert("PDF export library is loading, please try again in a moment.");
            return;
        }
        const invoiceElement = document.getElementById('invoice-content');
        if (!invoiceElement || !invoice) return;
        setIsExporting(true);
        try {
            const canvas = await html2canvas(invoiceElement, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`invoice-${invoice.invoiceNumber}.pdf`);
        } catch (error) {
            console.error("Error exporting PDF:", error);
        } finally {
            setIsExporting(false);
        }
    };
    
    if (!invoice) return <div className="text-center p-8">Invoice not found.</div>;
    
    const statusClasses: { [key in InvoiceStatus]: string } = {
        'Paid': 'bg-green-100 text-green-800 border-green-500 dark:bg-green-900/50 dark:text-green-300',
        'Unpaid': 'bg-red-100 text-red-800 border-red-500 dark:bg-red-900/50 dark:text-red-300',
        'Partial': 'bg-yellow-100 text-yellow-800 border-yellow-500 dark:bg-yellow-900/50 dark:text-yellow-300',
        'Draft': 'bg-slate-100 text-slate-800 border-slate-500 dark:bg-slate-800 dark:text-slate-300',
    };

    const templateClass = `invoice-${invoice?.template || 'classic'}`;

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-6 print:hidden">
                <button onClick={onBack} className={buttonClasses.secondary}>&larr; Back to Invoices</button>
                <div className="flex gap-2">
                    <button onClick={() => onEdit(invoiceId)} className={buttonClasses.secondary}>Edit</button>
                    <button onClick={handleExportPDF} disabled={isExporting || !html2canvas} className={`${buttonClasses.primary} flex items-center gap-2 bg-orange-500 hover:bg-orange-600`}>
                        {isExporting ? <><Spinner /> Exporting...</> : 'Export to PDF'}
                    </button>
                </div>
            </div>

            <div id="invoice-content" className={`bg-white dark:bg-slate-900 p-8 rounded-xl shadow-lg border dark:border-slate-800 printable-a4 ${templateClass}`}>
                 <header className="flex justify-between items-start pb-4 mb-8 border-b-2 dark:border-slate-700">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100">INVOICE</h1>
                        <p className="text-lg text-slate-600 dark:text-slate-300">WASLA Property Solutions</p>
                    </div>
                    <div className="text-right">
                        <p><strong className="text-slate-600 dark:text-slate-400">Invoice #:</strong> {invoice.invoiceNumber}</p>
                        <p><strong className="text-slate-600 dark:text-slate-400">Date:</strong> {formatDate(invoice.invoiceDate)}</p>
                        <p><strong className="text-slate-600 dark:text-slate-400">Due Date:</strong> {formatDate(invoice.dueDate)}</p>
                    </div>
                </header>
                
                <div className="grid grid-cols-2 gap-8 mb-8">
                    <div>
                        <h3 className="font-semibold text-slate-500 dark:text-slate-400 mb-1">BILLED TO</h3>
                        <p className="font-bold text-lg text-slate-800 dark:text-slate-200">{invoice.clientName}</p>
                        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line">{invoice.clientAddress}</p>
                        <p className="text-slate-700 dark:text-slate-300">{invoice.clientEmail}</p>
                    </div>
                    <div className={`text-center self-center justify-self-end p-4 border-2 rounded-lg ${statusClasses[invoice.status]}`}>
                        <span className="text-2xl font-bold tracking-widest uppercase">{invoice.status}</span>
                    </div>
                </div>

                <table className="w-full mb-8">
                    <thead className="bg-slate-100 dark:bg-slate-800">
                        <tr>
                            <th className="p-3 text-left font-bold text-slate-700 dark:text-slate-200">Description</th>
                            <th className="p-3 text-right font-bold text-slate-700 dark:text-slate-200">Quantity</th>
                            <th className="p-3 text-right font-bold text-slate-700 dark:text-slate-200">Unit Price</th>
                            <th className="p-3 text-right font-bold text-slate-700 dark:text-slate-200">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {invoice.services.map(item => (
                            <tr key={item.id}>
                                <td className="p-3">{item.description}</td>
                                <td className="p-3 text-right">{item.quantity}</td>
                                <td className="p-3 text-right font-mono">{formatCurrency(item.unitPrice)}</td>
                                <td className="p-3 text-right font-mono">{formatCurrency(item.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                <div className="flex justify-end mb-8">
                    <div className="w-full max-w-sm balance-summary">
                        <div className="flex justify-between py-2"><span className="text-slate-600 dark:text-slate-400">Subtotal:</span> <span className="font-mono">{formatCurrency(invoice.subtotal)}</span></div>
                        <div className="flex justify-between py-2"><span className="text-slate-600 dark:text-slate-400">Tax (5%):</span> <span className="font-mono">{formatCurrency(invoice.tax)}</span></div>
                        <div className="flex justify-between py-2 font-bold text-lg border-t-2 dark:border-slate-700"><span className="text-slate-800 dark:text-slate-200">Total:</span> <span className="font-mono text-slate-800 dark:text-slate-200">{formatCurrency(invoice.totalAmount)}</span></div>
                        <div className="flex justify-between py-2"><span className="text-slate-600 dark:text-slate-400">Amount Paid:</span> <span className="font-mono">{formatCurrency(invoice.amountPaid)}</span></div>
                        <div className="flex justify-between p-3 mt-2 text-xl font-bold rounded-lg balance-due-box"><span className="text-slate-800 dark:text-slate-200">Balance Due:</span> <span className="font-mono text-slate-800 dark:text-slate-200">{formatCurrency(invoice.totalAmount - invoice.amountPaid)}</span></div>
                    </div>
                </div>
                
                {invoice.notes && <div className="border-t pt-4 dark:border-slate-700">
                    <h4 className="font-semibold text-slate-500 dark:text-slate-400 mb-1">Notes</h4>
                    <p className="text-slate-700 dark:text-slate-300">{invoice.notes}</p>
                </div>}

                <footer className="text-center text-xs text-slate-500 dark:text-slate-400 pt-8 mt-8 border-t dark:border-slate-700">
                    <p>Thank you for your business!</p>
                    <p>WASLA Property Solutions | waslaoman.com | info@waslaoman.com</p>
                </footer>
            </div>
            <style>{`
                /* Template-specific styles */
                
                /* --- Classic Template --- */
                .invoice-classic header h1 {
                    font-family: serif;
                    font-weight: bold;
                }
                .invoice-classic header {
                    border-bottom-color: #e5e7eb; /* gray-200 */
                }
                .dark .invoice-classic header {
                     border-bottom-color: #334155; /* slate-700 */
                }
                .invoice-classic table thead {
                    background-color: #f3f4f6; /* gray-100 */
                }
                .dark .invoice-classic table thead {
                    background-color: #1e293b; /* slate-800 */
                }
                .invoice-classic .balance-due-box {
                     background-color: #f3f4f6; /* gray-100 */
                     border: 1px solid #e5e7eb; /* gray-200 */
                }
                 .dark .invoice-classic .balance-due-box {
                     background-color: #1e293b; /* slate-800 */
                     border-color: #334155; /* slate-700 */
                }

                /* --- Modern Template --- */
                .invoice-modern header {
                    border-bottom: 4px solid #3b82f6; /* blue-500 */
                }
                .invoice-modern header h1 {
                    color: #3b82f6;
                    font-weight: 800;
                    letter-spacing: 0.05em;
                }
                .dark .invoice-modern header h1 { color: #60a5fa; /* blue-400 */ }

                .invoice-modern table thead {
                    background-color: transparent;
                    border-bottom: 2px solid #3b82f6;
                }
                 .dark .invoice-modern table thead { border-bottom-color: #60a5fa; }
                
                .invoice-modern table thead th {
                     color: #3b82f6;
                }
                .dark .invoice-modern table thead th {
                     color: #60a5fa; /* blue-400 */
                }
                .invoice-modern .balance-due-box {
                     background-color: #3b82f6;
                }
                 .invoice-modern .balance-due-box span {
                    color: white !important;
                }
                .dark .invoice-modern .balance-due-box {
                     background-color: #60a5fa;
                }
                .dark .invoice-modern .balance-due-box span {
                    color: #1e3a8a !important; /* blue-900 */
                }


                /* --- Compact Template --- */
                .invoice-compact {
                    font-size: 0.8rem;
                    padding: 10mm;
                }
                .invoice-compact h1 { font-size: 2rem; }
                .invoice-compact p, .invoice-compact td, .invoice-compact th { line-height: 1.2; }
                .invoice-compact table td, .invoice-compact table th {
                    padding: 6px 8px;
                }
                .invoice-compact .balance-summary > div {
                    padding: 4px 0;
                }
                .invoice-compact .balance-due-box {
                    padding: 8px;
                    font-size: 1rem;
                    background-color: #f3f4f6; /* gray-100 */
                }
                .dark .invoice-compact .balance-due-box {
                    background-color: #1e293b; /* slate-800 */
                }
                
                @media print {
                    body { -webkit-print-color-adjust: exact; color-adjust: exact; }
                }
            `}</style>
        </div>
    );
};


// --- New Settings Page Components ---

const SettingsPage: React.FC<{ settings: AppSettings; onSave: (settings: AppSettings) => void; }> = ({ settings, onSave }) => {
    type SettingsTab = 'profile' | 'preferences' | 'security' | 'help';
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
    const [showToast, setShowToast] = useState(false);

    useEffect(() => {
        // If the parent settings change (e.g., from header theme toggle), update local state
        setLocalSettings(settings);
    }, [settings]);

    const handleSave = () => {
        onSave(localSettings);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
    };
    
    const handleProfileChange = (field: keyof AppSettings['profile'], value: string) => {
        setLocalSettings(s => ({ ...s, profile: { ...s.profile, [field]: value } }));
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const base64 = await resizeAndCompressImage(e.target.files[0], 256, 0.8);
                handleProfileChange('avatar', base64);
            } catch (error) {
                console.error("Error uploading avatar:", error);
                alert("Could not upload image. Please try again.");
            }
        }
    };

    const handlePasswordChange = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
        const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
        if (newPassword !== confirmPassword) {
            alert("New passwords do not match.");
            return;
        }
        if (newPassword.length < 8) {
             alert("Password must be at least 8 characters long.");
             return;
        }
        alert("Password changed successfully! (This is a demo)");
        form.reset();
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'profile':
                return (
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-semibold mb-4">Profile Information</h3>
                            <div className="flex items-center gap-6">
                                <img src={localSettings.profile.avatar} alt="Profile" className="w-24 h-24 rounded-full object-cover ring-4 ring-blue-500/50" />
                                <div>
                                    <label htmlFor="avatarUpload" className={`cursor-pointer ${buttonClasses.primary}`}>
                                        Upload New Picture
                                    </label>
                                    <input type="file" id="avatarUpload" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">PNG, JPG, GIF up to 10MB.</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium mb-1">Full Name</label><input type="text" value={localSettings.profile.name} onChange={e => handleProfileChange('name', e.target.value)} className={inputClasses}/></div>
                            <div><label className="block text-sm font-medium mb-1">Email Address</label><input type="email" value={localSettings.profile.email} onChange={e => handleProfileChange('email', e.target.value)} className={inputClasses}/></div>
                            <div><label className="block text-sm font-medium mb-1">Phone Number</label><input type="tel" value={localSettings.profile.phone} onChange={e => handleProfileChange('phone', e.target.value)} className={inputClasses}/></div>
                        </div>
                         <div>
                            <h3 className="text-lg font-semibold mb-4 pt-4 border-t dark:border-slate-700">Change Password</h3>
                            <form onSubmit={handlePasswordChange} className="space-y-4">
                                <input type="password" name="currentPassword" placeholder="Current Password" required className={inputClasses} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input type="password" name="newPassword" placeholder="New Password" required className={inputClasses} />
                                    <input type="password" name="confirmPassword" placeholder="Confirm New Password" required className={inputClasses} />
                                </div>
                                <div className="text-right">
                                    <button type="submit" className={buttonClasses.primary}>Update Password</button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            case 'preferences':
                 return (
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-semibold mb-4">Theme</h3>
                             <div className="flex gap-4">
                                <button onClick={() => setLocalSettings(s => ({...s, theme: 'light'}))} className={`p-4 border-2 rounded-xl w-full text-center transition-colors ${localSettings.theme === 'light' ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-300 dark:border-slate-700 hover:border-blue-400'}`}>
                                     <svg className="h-8 w-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                     Light Mode
                                </button>
                                <button onClick={() => setLocalSettings(s => ({...s, theme: 'dark'}))} className={`p-4 border-2 rounded-xl w-full text-center transition-colors ${localSettings.theme === 'dark' ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-300 dark:border-slate-700 hover:border-blue-400'}`}>
                                    <svg className="h-8 w-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                                    Dark Mode
                                </button>
                            </div>
                        </div>
                         <div>
                            <h3 className="text-lg font-semibold mb-4">Notifications</h3>
                            <div className="space-y-2">
                                <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                    <span>Email Notifications</span>
                                    <input type="checkbox" className="toggle" checked={localSettings.notifications.email} onChange={e => setLocalSettings(s => ({...s, notifications: {...s.notifications, email: e.target.checked}}))} />
                                </label>
                                <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                    <span>Push Notifications</span>
                                    <input type="checkbox" className="toggle" checked={localSettings.notifications.push} onChange={e => setLocalSettings(s => ({...s, notifications: {...s.notifications, push: e.target.checked}}))} />
                                </label>
                            </div>
                        </div>
                         <div>
                            <h3 className="text-lg font-semibold mb-4">Language</h3>
                             <select value={localSettings.language} onChange={e => setLocalSettings(s => ({...s, language: e.target.value as 'en' | 'ar'}))} className={inputClasses}>
                                <option value="en">English</option>
                                <option value="ar">العربية (Arabic)</option>
                            </select>
                        </div>
                    </div>
                );
            case 'security':
                return (
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-semibold mb-4">Two-Factor Authentication (2FA)</h3>
                             <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg flex items-center justify-between">
                                 <div>
                                    <p className="font-medium">2FA is currently disabled.</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Add an extra layer of security to your account.</p>
                                </div>
                                <button className={`${buttonClasses.primary} bg-green-600 hover:bg-green-700`}>Enable</button>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold mb-4">Connected Devices</h3>
                            <ul className="divide-y dark:divide-slate-700">
                                {[{icon: "💻", name: "Chrome on Windows 11", ip: "192.168.1.10", current: true}, {icon: "📱", name: "Safari on iPhone 15", ip: "198.51.100.2", current: false}].map(d => (
                                     <li key={d.name} className="py-3 flex items-center justify-between">
                                         <div className="flex items-center gap-4">
                                             <span className="text-2xl">{d.icon}</span>
                                             <div>
                                                 <p className="font-medium">{d.name} {d.current && <span className="text-xs text-green-500">(This device)</span>}</p>
                                                 <p className="text-sm text-slate-500 dark:text-slate-400">IP Address: {d.ip}</p>
                                             </div>
                                         </div>
                                         {!d.current && <button className="text-sm text-red-500 hover:underline">Sign Out</button>}
                                     </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                );
            case 'help':
                const faqs = [
                    { q: "How do I create a new inspection?", a: "Navigate to the 'Inspections' tab and click the 'New Inspection' button. Fill out the details and start adding inspection points." },
                    { q: "Can I export my reports to PDF?", a: "Yes, after viewing a report, you can use the 'Export to PDF' button to generate a downloadable PDF file." },
                    { q: "How does the AI Summary work?", a: "The AI Summary analyzes all the 'Fail' items in your report and generates a professional, easy-to-read summary of the key issues." }
                ];
                return (
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-semibold mb-4">Frequently Asked Questions</h3>
                            <div className="space-y-2">
                                {faqs.map(faq => (
                                     <details key={faq.q} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg cursor-pointer">
                                        <summary className="font-semibold">{faq.q}</summary>
                                        <p className="mt-2 text-slate-600 dark:text-slate-300">{faq.a}</p>
                                    </details>
                                ))}
                            </div>
                        </div>
                        <div>
                             <h3 className="text-lg font-semibold mb-4">Support</h3>
                             <button className={`w-full text-left p-3 ${buttonClasses.secondary}`}>Contact Support</button>
                             <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">App Version: 1.0.0</p>
                        </div>
                    </div>
                );
        }
    };
    
    const NavItem: React.FC<{ tab: SettingsTab; label: string; icon: React.ReactNode }> = ({ tab, label, icon }) => (
        <button
            onClick={() => setActiveTab(tab)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
        >
            {icon}
            <span className="font-medium">{label}</span>
        </button>
    );

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border dark:border-slate-800 flex flex-col md:flex-row min-h-[70vh]">
            <aside className="w-full md:w-1/4 border-b md:border-b-0 md:border-r dark:border-slate-800 p-4">
                <nav className="space-y-1">
                    <NavItem tab="profile" label="Profile" icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>} />
                    <NavItem tab="preferences" label="Preferences" icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.096 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
                    <NavItem tab="security" label="Security" icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>} />
                    <NavItem tab="help" label="Help & Support" icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
                </nav>
            </aside>
            <main className="w-full md:w-3/4 p-6 overflow-y-auto">
                <div className="mb-6">
                    {renderContent()}
                </div>
                 <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                    <button type="button" onClick={() => setLocalSettings(settings)} className={buttonClasses.secondary}>Cancel</button>
                    <button type="button" onClick={handleSave} className={buttonClasses.primary}>Save Changes</button>
                </div>
            </main>
            {showToast && (
                <div className="fixed bottom-5 right-5 bg-green-500 text-white py-2 px-4 rounded-lg shadow-lg animate-bounce">
                    Settings saved successfully!
                </div>
            )}
            <style>{`
                .toggle {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 40px;
                    height: 22px;
                    display: inline-block;
                    position: relative;
                    border-radius: 50px;
                    overflow: hidden;
                    outline: none;
                    border: none;
                    cursor: pointer;
                    background-color: #718096;
                    transition: background-color 0.3s;
                }
                .toggle:before {
                    content: "";
                    display: block;
                    position: absolute;
                    width: 18px;
                    height: 18px;
                    background: #fff;
                    left: 2px;
                    top: 2px;
                    border-radius: 50%;
                    transition: left 0.3s;
                }
                .toggle:checked {
                    background-color: #3b82f6;
                }
                .toggle:checked:before {
                    left: 20px;
                }
            `}</style>
        </div>
    );
};


// --- Main App Structure ---

type Page = 'dashboard' | 'inspections' | 'clients' | 'invoices' | 'reports' | 'settings';

type InspectionViewState = 
    | { page: 'inspections-list' }
    | { page: 'form'; id?: string }
    | { page: 'report'; id: string };

type InvoiceViewState = 
    | { page: 'invoices-list' }
    | { page: 'invoice-form'; id?: string }
    | { page: 'invoice-view'; id: string };

const AppLogo: React.FC<{ inSidebar?: boolean }> = ({ inSidebar = false }) => (
    <div className={`flex items-center ${inSidebar ? 'space-x-2' : ''}`}>
        <div className="text-center">
            <h2 className={`font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-500 ${inSidebar ? 'text-xl' : 'text-2xl'}`}>
                WASLA
            </h2>
            <p className={`text-xs font-semibold tracking-wide text-teal-700 dark:text-teal-400 ${inSidebar ? 'hidden sm:block' : ''}`}>
                Property Solutions
            </p>
        </div>
    </div>
);


const App: React.FC = () => {
    const [activePage, setActivePage] = useState<Page>('dashboard');
    const [inspectionView, setInspectionView] = useState<InspectionViewState>({ page: 'inspections-list' });
    const [invoiceView, setInvoiceView] = useState<InvoiceViewState>({ page: 'invoices-list' });
    const { getSettings, saveSettings } = useAppSettings();
    const [settings, setSettings] = useState(getSettings);
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
    
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth <= 768) {
                setIsSidebarOpen(false);
            } else {
                setIsSidebarOpen(true);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        saveSettings(settings);
        if (settings.theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [settings]);

    const handleSaveSettings = (newSettings: AppSettings) => {
        setSettings(newSettings);
    };

    const toggleTheme = () => {
        setSettings(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }));
    };

    const navigateToInspectionsList = useCallback(() => setInspectionView({ page: 'inspections-list' }), []);
    const navigateToInspectionReport = useCallback((id: string) => setInspectionView({ page: 'report', id }), []);
    const navigateToInspectionForm = useCallback((id?: string) => setInspectionView({ page: 'form', id }), []);
    
    const navigateToInvoicesList = useCallback(() => setInvoiceView({ page: 'invoices-list' }), []);
    const navigateToInvoiceView = useCallback((id: string) => setInvoiceView({ page: 'invoice-view', id }), []);
    const navigateToInvoiceForm = useCallback((id?: string) => setInvoiceView({ page: 'invoice-form', id }), []);

    const renderInspectionsView = () => {
        switch (inspectionView.page) {
            case 'form':
                return <InspectionForm inspectionId={inspectionView.id} onSave={navigateToInspectionsList} onCancel={navigateToInspectionsList} />;
            case 'report':
                return <InspectionReport inspectionId={inspectionView.id} onBack={navigateToInspectionsList} onEdit={navigateToInspectionForm}/>;
            case 'inspections-list':
            default:
                return <InspectionsDashboard onView={navigateToInspectionReport} onEdit={navigateToInspectionForm} onCreate={() => navigateToInspectionForm()} />;
        }
    };

     const renderInvoicesView = () => {
        switch (invoiceView.page) {
            case 'invoice-form':
                return <InvoiceForm invoiceId={invoiceView.id} onSave={navigateToInvoicesList} onCancel={navigateToInvoicesList} />;
            case 'invoice-view':
                return <InvoiceViewer invoiceId={invoiceView.id} onBack={navigateToInvoicesList} onEdit={navigateToInvoiceForm}/>;
            case 'invoices-list':
            default:
                return <InvoicesDashboard onView={navigateToInvoiceView} onEdit={navigateToInvoiceForm} onCreate={() => navigateToInvoiceForm()} />;
        }
    };


    const handlePageChange = (page: Page) => {
        setActivePage(page);
        if (page === 'inspections') setInspectionView({ page: 'inspections-list' });
        if (page === 'invoices') setInvoiceView({ page: 'invoices-list' });
        if (window.innerWidth <= 768) {
            setIsSidebarOpen(false);
        }
    };

    const renderPage = () => {
        switch (activePage) {
            case 'dashboard': return <Dashboard />;
            case 'inspections': return renderInspectionsView();
            case 'clients': return <ClientsPage />;
            case 'invoices': return renderInvoicesView();
            case 'reports': return <PlaceholderPage title="Reports" />;
            case 'settings': return <SettingsPage settings={settings} onSave={handleSaveSettings} />;
            default: return <Dashboard />;
        }
    };
    
    const pageTitles: Record<Page, string> = {
        dashboard: 'Dashboard',
        inspections: 'Inspections',
        clients: 'Clients',
        invoices: 'Invoices',
        reports: 'Reports',
        settings: 'Settings'
    };
    
    const NavLink: React.FC<{ page: Page, children: React.ReactNode, icon: React.ReactNode }> = ({ page, children, icon }) => (
        <a
            href="#"
            onClick={(e) => { e.preventDefault(); handlePageChange(page); }}
            className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activePage === page 
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' 
                : 'text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
        >
            {icon}
            <span className="ml-3">{children}</span>
        </a>
    );

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
            {isSidebarOpen && window.innerWidth <= 768 && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30 md:hidden"></div>}
            {/* Sidebar */}
            <aside className={`w-64 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col fixed inset-y-0 left-0 z-40 md:relative md:translate-x-0 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                 <div className="h-20 flex items-center justify-center px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
                    <AppLogo inSidebar={true}/>
                </div>
                <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
                    <NavLink page="dashboard" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>}>Dashboard</NavLink>
                    <NavLink page="inspections" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}>Inspections</NavLink>
                    <NavLink page="clients" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}>Clients</NavLink>
                    <NavLink page="invoices" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}>Invoices</NavLink>
                    <NavLink page="reports" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}>Reports</NavLink>
                    <NavLink page="settings" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.096 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}>Settings</NavLink>
                </nav>
            </aside>

            {/* Main Content */}
            <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'md:ml-0' : 'md:-ml-64'}`}>
                <header className="sticky top-0 bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm z-20 border-b border-slate-200 dark:border-slate-800">
                    <div className="container mx-auto px-6 py-3 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                             <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                             </button>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{pageTitles[activePage]}</h2>
                        </div>
                        <div className="flex items-center space-x-4">
                            <button onClick={toggleTheme} className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                                {settings.theme === 'dark' ? 
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg> :
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                                }
                            </button>
                            <button className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 relative">
                                <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900"></span>
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                            </button>
                            <div className="flex items-center gap-2">
                                <img className="h-9 w-9 rounded-full object-cover" src={settings.profile.avatar} alt="User avatar" />
                                <span className="hidden sm:inline font-semibold text-sm">{settings.profile.name}</span>
                            </div>
                        </div>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-6">
                    {renderPage()}
                </main>
            </div>
        </div>
    );
};

export default App;