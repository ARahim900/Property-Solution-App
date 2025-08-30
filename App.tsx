
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InspectionData, InspectionArea, InspectionItem, InspectionPhoto, InspectionStatus, Client, Invoice, InvoiceStatus, InvoiceServiceItem, Property } from './types';
import { INSPECTION_CATEGORIES, MOCK_CLIENTS } from './constants';
import { generateReportSummary, analyzeDefectImage } from './services/geminiService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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
        const inspections = getInspections().filter(insp => insp.id !== inspectionData.id);
        inspections.push(inspectionData);
        localStorage.setItem('inspections', JSON.stringify(inspections));
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


// --- Helper Functions ---
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    // Handles 'YYYY-MM-DD' format from date inputs
    const date = new Date(dateString);
    const timeZoneOffset = date.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(date.getTime() + timeZoneOffset);

    return adjustedDate.toLocaleDateString('en-US', {
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

    // The previous implementation had inconsistent formatting.
    // This ensures that the currency symbol/code is always prepended,
    // matching the convention seen in the screenshot (e.g., "$0.00").
    // It also handles the case where an empty string is passed from dashboard cards.
    const displayCurrency = currency || 'OMR';
    
    return `${displayCurrency} ${formattedAmount}`;
};


// --- UI Components ---
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
        <div className="fixed inset-0 bg-black bg-opacity-60 dark:bg-opacity-80 z-50 flex justify-center items-center" onClick={onClose}>
            <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center border-b dark:border-gray-600 pb-3 mb-4">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
                    <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-2xl">&times;</button>
                </div>
                {children}
            </div>
        </div>
    );
};

const PhotoUpload: React.FC<{ photos: InspectionPhoto[]; onUpload: (photo: InspectionPhoto) => void; onRemove: (index: number) => void }> = ({ photos, onUpload, onRemove }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            for (const file of Array.from(event.target.files)) {
                try {
                    const base64 = await fileToBase64(file);
                    onUpload({ base64, name: file.name });
                } catch (error) {
                    console.error("Error converting file to base64", error);
                }
            }
        }
    };
    
    return (
        <div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-2">
                {photos.map((photo, index) => (
                    <div key={index} className="relative group">
                        <img src={`data:image/jpeg;base64,${photo.base64}`} alt={`upload-preview-${index}`} className="w-full h-20 object-cover rounded-md" />
                        <button type="button" onClick={() => onRemove(index)} className="absolute top-0 right-0 bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-500 hover:text-blue-600 transition"
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
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleUpdate = (field: keyof InspectionItem, value: any) => {
        onUpdate({ ...item, [field]: value });
    };

    const handleAnalyze = async (photo: InspectionPhoto) => {
        setIsAnalyzing(true);
        try {
            const analysis = await analyzeDefectImage(photo, item.point);
            handleUpdate('comments', `${item.comments ? item.comments + '\n\n' : ''}AI Analysis: ${analysis}`);
        } catch (error) {
            console.error("AI Analysis failed:", error);
            handleUpdate('comments', `${item.comments ? item.comments + '\n\n' : ''}AI Analysis failed.`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const statusClasses: { [key in InspectionStatus]: string } = {
        'Pass': 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700',
        'Fail': 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700',
        'N/A': 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
    };

    return (
        <div className="bg-white dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600 space-y-4">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-gray-800 dark:text-gray-100">{item.point}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.category}</p>
                </div>
                <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-xl font-bold">&times;</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                    <select value={item.status} onChange={e => handleUpdate('status', e.target.value)} className={`w-full p-2 rounded-md border ${statusClasses[item.status]}`}>
                        <option value="Pass">Pass</option>
                        <option value="Fail">Fail</option>
                        <option value="N/A">N/A</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
                    <input type="text" value={item.location} onChange={e => handleUpdate('location', e.target.value)} placeholder="e.g., Master Bedroom Ceiling" className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-md text-gray-900 dark:text-gray-200"/>
                </div>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comments</label>
                <textarea value={item.comments} onChange={e => handleUpdate('comments', e.target.value)} placeholder="Add comments..." rows={3} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-md text-gray-900 dark:text-gray-200"></textarea>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photos</label>
                 <PhotoUpload
                    photos={item.photos}
                    onUpload={(photo) => handleUpdate('photos', [...item.photos, photo])}
                    onRemove={(index) => handleUpdate('photos', item.photos.filter((_, i) => i !== index))}
                />
                 {item.status === 'Fail' && item.photos.length > 0 && (
                     <div className="mt-2">
                        <button type="button" onClick={() => handleAnalyze(item.photos[item.photos.length-1])} disabled={isAnalyzing} className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md flex items-center gap-2 disabled:bg-blue-400 dark:disabled:bg-blue-800">
                             {isAnalyzing ? <><Spinner className="text-white"/> Analyzing...</> : 'AI Analyze Last Photo'}
                         </button>
                     </div>
                 )}
            </div>
        </div>
    );
};

const InspectionAreaCard: React.FC<{ area: InspectionArea; onUpdate: (updatedArea: InspectionArea) => void; onRemove: () => void }> = ({ area, onUpdate, onRemove }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

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

    return (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 shadow-sm mb-6 border dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
                <input
                    type="text"
                    value={area.name}
                    onChange={e => handleNameChange(e.target.value)}
                    className="text-xl font-bold bg-transparent border-b-2 border-transparent focus:border-blue-500 outline-none text-gray-900 dark:text-gray-100"
                    placeholder="Area Name"
                />
                <button type="button" onClick={onRemove} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-semibold">Remove Area</button>
            </div>
            
            <div className="space-y-4">
                {area.items.map(item => <InspectionItemRow key={item.id} item={item} onUpdate={handleUpdateItem} onRemove={() => handleRemoveItem(item.id)} />)}
            </div>

            <button type="button" onClick={() => setIsModalOpen(true)} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md w-full">
                Add Inspection Point
            </button>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Inspection Point">
                <div className="space-y-4">
                    {Object.entries(INSPECTION_CATEGORIES).map(([category, points]) => (
                        <div key={category}>
                            <h4 className="font-semibold text-lg text-gray-700 dark:text-gray-300 mb-2 border-b dark:border-gray-600 pb-1">{category}</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {points.map(point => (
                                    <button
                                        type="button"
                                        key={point}
                                        onClick={() => { handleAddItem(category, point); setIsModalOpen(false); }}
                                        className="text-left p-2 bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-md text-sm transition text-gray-800 dark:text-gray-300"
                                    >
                                        {point}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
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
            setInspection({
                id: `insp_${Date.now()}`,
                clientName: '',
                propertyLocation: '',
                propertyType: 'Apartment',
                inspectorName: '',
                inspectionDate: new Date().toISOString().split('T')[0],
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

    const inputClasses = "p-2 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200";

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white dark:bg-gray-800/50 p-6 rounded-lg shadow-md border dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">Inspection Details</h2>
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
                <button type="button" onClick={handleAddArea} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-md">
                    Add Another Area
                </button>
                <div className="flex gap-4">
                    <button type="button" onClick={onCancel} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md">Cancel</button>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">Save Inspection</button>
                </div>
            </div>
        </form>
    );
};

const ReportTemplate: React.FC<{ inspection: InspectionData }> = ({ inspection }) => {
    const WaslaLogo = () => (
        <div className="flex items-center space-x-2">
            <div className="flex flex-col">
                <div className="w-4 h-4 bg-green-500"></div>
                <div className="w-4 h-2 bg-blue-500 mt-0.5"></div>
            </div>
            <div className="text-2xl font-bold tracking-wider text-gray-700 dark:text-gray-300">
                <span className="text-green-500">WASLA</span>
                <p className="text-xs font-normal tracking-normal text-gray-500 dark:text-gray-400">Property Solutions</p>
            </div>
        </div>
    );
    
    return (
        <div className="print:block hidden">
            {/* Page 1 */}
            <div className="printable-a4 bg-white dark:bg-gray-800 p-8 text-sm break-after-page">
                <header className="flex justify-center items-center flex-col mb-4">
                    <WaslaLogo />
                    <h1 className="text-xl font-bold mt-2 text-gray-800 dark:text-gray-100 uppercase tracking-widest">Property Inspection Report</h1>
                </header>
                
                <div className="flex space-x-8">
                    {/* English Column */}
                    <div className="w-1/2 space-y-4">
                        <section>
                            <h2 className="font-bold border-b pb-1 mb-2 text-base">OVERVIEW</h2>
                            <p className="font-bold">Dear Mr. {inspection.clientName},</p>
                            <p>Thank you for choosing Wasla Real Estate Solutions as your home inspector. Your prospective home is basically in grade () as per our inspection and classifications. However, a number of rather typical inspection issues were identified.</p>
                            <p>Please review the annexed report carefully before making your decision. If you need further explanation regarding this property conditions, please don't hesitate to call or email us from 9:00 am to 5:00 PM at:</p>
                            <p>Email: wasla.solution@gmail.com</p>
                            <p>Mobile: +968 90699799</p>
                        </section>

                        <section className="border-t pt-2">
                            <h3 className="font-bold">No property is perfect.</h3>
                            <p>Every building has imperfections or items that are ready for maintenance. It's the inspector's task to discover and report these so you can make informed decisions. This report should not be used as a tool to demean property, but rather as a way to illuminate the realities of the property.</p>
                        </section>
                        
                        <section className="border-t pt-2">
                             <h3 className="font-bold">This report is not an appraisal.</h3>
                             <p>When an appraiser determines worth, only the most obvious conditions of a property are taken into account to establish a safe loan amount. In effect, the appraiser is representing the interests of the lender. Home inspectors focus more on the interests of the prospective buyer; and, although inspectors must be careful not to make any statements relating to property value, their findings can help buyers more completely understand the true costs of ownership.</p>
                        </section>

                        <section className="border-t pt-2">
                            <h3 className="font-bold">Maintenance costs are normal.</h3>
                            <p>Homeowners should plan to spend around 1% of the total value of a property in maintenance costs, annually. (Annual costs of rental property maintenance are often 2%, or more.) If considerably less than this percentage has been invested during several years preceding an inspection, the property will usually show the obvious signs of neglect; and the new property owners may be required to invest significant time and money to address accumulated maintenance needs.</p>
                        </section>
                        
                        <section className="border-t pt-2">
                             <h3 className="font-bold">SCOPE OF THE INSPECTION:</h3>
                             <p>This report details the outcome of a visual survey of the property detailed in the annexed</p>
                        </section>
                    </div>

                    {/* Arabic Column */}
                    <div className="w-1/2 space-y-4 text-right" dir="rtl">
                        <section>
                            <h2 className="font-bold border-b pb-1 mb-2 text-base">نظرة عامة</h2>
                            <p className="font-bold">الأفاضل/ المحترمون {inspection.clientName}،</p>
                            <p>نشكر لكم اختياركم "وصلة للحلول العقارية" للقيام بفحص العقار الخاص بكم. وفقًا للفحص والتصنيف المعتمد لدينا، فإن العقار الذي ترغبون في شرائه يقع ضمن الدرجة ()، مع وجود بعض الملاحظات التي تُعد شائعة في عمليات الفحص العقاري.</p>
                            <p>يرجى مراجعة التقرير المرفق بعناية قبل اتخاذ قراركم النهائ، و إذا كنتم بحاجة إلى توضيحات إضافية حول حالة العقار، فلا تترددوا بالتواصل معنا عبر الهاتف أو البريد الإلكتروني من الساعة 9 صباحًا حتى 5 مساءً على وسائل التواصل التالية:</p>
                            <p>البريد الإلكتروني: wasla.solution@gmail.com</p>
                            <p>لهاتف: +96890699799</p>
                        </section>
                        
                         <section className="border-t pt-2">
                            <h3 className="font-bold">لا يوجد عقار مثالي</h3>
                            <p>كل عقار يحتوي على بعض العيوب أو الأجزاء التي تحتاج إلى صيانة. دور المفتش هو تحديد هذه النقاط وتقديمها بوضوح لمساعدتكم في اتخاذ قرارات مستنيرة. هذا التقرير لا يُقصد به التقليل من قيمة العقار، وإنما يهدف إلى توضيح الحالة الواقعية له.</p>
                        </section>

                        <section className="border-t pt-2">
                             <h3 className="font-bold">هذا التقرير ليس تقييما سعريًا</h3>
                             <p>عند قيام المثمن بتحديد قيمة العقار، فإنه يأخذ بعين الاعتبار فقط العيوب الظاهرة لتقدير مبلغ قرض آمن. بمعنى آخر، فإن المثمن يُمثل مصلحة الجهة المقرضة. أما فاحص العقار، فيركز على مصلحة المشتري المحتمل. ورغم أن المفتش لا يحدد قيمة العقار، إلا أن نتائج الفحص تساعد المشتري في فهم التكاليف الحقيقية لامتلاك العقار.</p>
                        </section>

                         <section className="border-t pt-2">
                            <h3 className="font-bold">تكاليف الصيانة أمر طبيعي</h3>
                            <p>ينبغي على مالكي العقارات تخصيص ما يُعادل 1% من قيمة العقار سنويًا لأعمال الصيانة الدورية. أما العقارات المؤجرة فقد تصل النسبة إلى 2% أو أكثر. وإذا لم يتم استثمار هذه النسبة على مدى عدة سنوات، فستظهر مؤشرات واضحة على الإهمال، مما يُحتم على المالك الجديد دفع تكاليف كبيرة لاحقًا لمعالجة هذه الإهمالات.</p>
                        </section>

                         <section className="border-t pt-2">
                             <h3 className="font-bold">نطاق الفحص</h3>
                             <p>يوضح هذا التقرير نتيجة الفحص البصري للعقار كما هو مفصل في قائمة الفحص المرفقة، بهدف تقييم جودة التنفيذ مقارنة بالمعايير المعتمدة.</p>
                        </section>
                    </div>
                </div>
            </div>

            {/* Page 2 */}
            <div className="printable-a4 bg-white dark:bg-gray-800 p-8 text-sm break-after-page">
                 <header className="flex justify-center items-center flex-col mb-4">
                    <WaslaLogo />
                </header>
                
                 <div className="flex space-x-8">
                    <div className="w-1/2 space-y-4">
                        <p>inspection checklist in order to check the quality of workmanship against applicable standards. It covers both the interior and the exterior of the property as well as garden, driveway and garage if relevant. Areas not inspected, for whatever reason, cannot guarantee that these areas are free from defects.</p>
                        <p>This report was formed as per the client request as a supportive opinion to enable him to have better understanding about property conditions. Our opinion does not study the property value or the engineering of the structure rather it studies the functionality of the property. This report will be listing the property defects supported by images and videos, by showing full study of the standards of property status and functionality including other relevant elements of the property as stated in the checklist.</p>
                        <section>
                            <h2 className="font-bold border-b pb-1 mb-2 text-base">CONFIDENTIALITY OF THE REPORT:</h2>
                            <p>The inspection report is to be prepared for the Client for the purpose of informing of the major deficiencies in the condition of the subject property and is solely and exclusively for Client's own information and may not be relied upon by any other person. Client may distribute copies of the inspection report to the seller and the real estate agents directly involved in this transaction, but Client and Inspector do not in any way intend to benefit said seller or the real estate agents directly or indirectly through this Agreement or the inspection report. In the event that the inspection report has been prepared for the SELLER of the subject property, an authorized representative of Wasla Real Estate Solutions will return to the property, for a fee, to meet with the BUYER for a consultation to provide a better understanding of the reported conditions and answer.</p>
                        </section>
                    </div>
                    <div className="w-1/2 space-y-4 text-right" dir="rtl">
                         <p>يشمل الفحص المناطق الداخلية والخارجية، بالإضافة إلى الحديقة، والممر، والجراج (إن وجد). كما لا يمكن ضمان خلو المناطق غير المفحوصة من العيوب لأي سبب كان.</p>
                         <p>وقد تم إعداد هذا التقرير بناءً على طلب العميل لتقديم رأي داعم يساعده على فهم حالة العقار بشكل أفضل. رأينا الفني لا يشمل تقييم القيمة السوقية أو التحليل الإنشائي، بل يركز على حالة العقار ووظائفه العامة. كما سيتم سرد العيوب المرصودة بناءً على دراسة كاملة لمعايير الحالة والأداء الوظيفي للعقار مشمولة بالصور والفيديوهات، إلى جانب العناصر الأخرى ذات الصلة كما هو موضح في قائمة الفحص.</p>
                        <section>
                            <h2 className="font-bold border-b pb-1 mb-2 text-base">سرية التقرية</h2>
                            <p>تم إعداد تقرير الفحص هذا خصيصًا للعميل بغرض إعلامه بالنواقص الجوهرية في حالة العقار محل الفحص، وهو للاستخدام الشخصي فقط ولا يجوز الاعتماد عليه من قبل أي طرف آخر. يجوز للعميل مشاركة نسخة من التقرير مع البائع أو وكلاء العقارات المعنيين بهذه الصفقة، إلا أن كل من العميل والفاحص لا يقصدان من خلال هذا التقرير تحقيق أي منفعة مباشرة أو غير مباشرة لهؤلاء الأطراف. وفي حال تم إعداد هذا التقرير بطلب من البائع، فإن ممثلا معتمدًا من شركة وصلة لحلول العقار سيعود إلى العقار - مقابل رسوم - لعقد جلسة استشارية مع المشتري بهدف توضيح الملاحظات الواردة في التقرير والإجابة عن استفساراته.</p>
                        </section>
                    </div>
                </div>

                <div className="mt-8 pt-4 border-t flex justify-between">
                    <div className="w-1/2 space-y-2">
                        <p><strong>Client Name:</strong> {inspection.clientName}</p>
                        <p><strong>Signature:</strong> ________________________</p>
                        <p><strong>Prepared by:</strong> {inspection.inspectorName}</p>
                        <p><strong>Stamp:</strong></p>
                        <p><strong>Date:</strong> {formatDate(inspection.inspectionDate)}</p>
                        <p className="mt-4">Property Inspection report is annexed</p>
                    </div>
                     <div className="w-1/2 space-y-2 text-right" dir="rtl">
                        <p><strong>اسم العميل:</strong> {inspection.clientName}</p>
                        <p><strong>التوقيع:</strong> ________________________</p>
                        <p><strong>أعد التقرير بواسطة:</strong> {inspection.inspectorName}</p>
                        <p><strong>الختم:</strong></p>
                        <p><strong>التاريخ:</strong> {formatDate(inspection.inspectionDate)}</p>
                        <p className="mt-4">مرفق تقرير الفحص</p>
                    </div>
                </div>
                
                <table className="w-full mt-8 border-collapse border text-center">
                    <thead>
                        <tr className="bg-gray-100 dark:bg-gray-700">
                            <th className="border p-2">Grade</th>
                            <th className="border p-2">AAA</th>
                            <th className="border p-2">AA</th>
                            <th className="border p-2">A</th>
                            <th className="border p-2">B</th>
                            <th className="border p-2">C</th>
                            <th className="border p-2">D</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="border p-2 font-bold">Description</td>
                            <td className="border p-2">Excellent</td>
                            <td className="border p-2">Very Good</td>
                            <td className="border p-2">Good</td>
                            <td className="border p-2">Meeting the standards</td>
                            <td className="border p-2">Acceptable</td>
                            <td className="border p-2">Require maintenance</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};


const InspectionReport: React.FC<{ inspectionId: string; onBack: () => void, onEdit: (id: string) => void }> = ({ inspectionId, onBack, onEdit }) => {
    const { getInspectionById, saveInspection } = useInspections();
    const [inspection, setInspection] = useState<InspectionData | null>(null);
    const [isSummaryLoading, setIsSummaryLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        setInspection(getInspectionById(inspectionId));
    }, [inspectionId]);
    
    const handleGenerateSummary = async () => {
        if (!inspection) return;
        setIsSummaryLoading(true);
        const failedItems = inspection.areas.flatMap(area => area.items.filter(item => item.status === 'Fail'));
        const summary = await generateReportSummary(failedItems);
        const updatedInspection = { ...inspection, aiSummary: summary };
        setInspection(updatedInspection);
        saveInspection(updatedInspection);
        setIsSummaryLoading(false);
    };

    const handleExportPDF = async () => {
        const reportContainer = document.getElementById('full-report-container');
        const contentElement = document.getElementById('report-content');
        if (!reportContainer || !contentElement || !inspection) return;

        setIsExporting(true);
        // Temporarily make the template visible for html2canvas
        const templateContainer = reportContainer.querySelector('.print\\:block') as HTMLElement;
        if(templateContainer) templateContainer.classList.remove('hidden');

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const commonCanvasOptions = {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff', // Force white background
            };

            // --- Pages from ReportTemplate ---
            const templatePages = templateContainer.querySelectorAll('.printable-a4');
            for (let i = 0; i < templatePages.length; i++) {
                const page = templatePages[i] as HTMLElement;
                const canvas = await html2canvas(page, commonCanvasOptions);
                const imgData = canvas.toDataURL('image/png');
                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            }

            // --- Main Content Page(s) ---
            // This element's height is dynamic.
            const contentCanvas = await html2canvas(contentElement, {
                ...commonCanvasOptions,
                windowHeight: contentElement.scrollHeight,
                scrollY: 0,
            });
            const contentImgData = contentCanvas.toDataURL('image/png');
            const contentImgProps = pdf.getImageProperties(contentImgData);
            const contentPdfWidth = pdf.internal.pageSize.getWidth();
            const totalContentPDFHeight = (contentImgProps.height * contentPdfWidth) / contentImgProps.width;

            let position = 0;
            let heightLeft = totalContentPDFHeight;
            
            pdf.addPage();
            pdf.addImage(contentImgData, 'PNG', 0, position, contentPdfWidth, totalContentPDFHeight);
            heightLeft -= pdfHeight;

            while (heightLeft > 0) {
                position -= pdfHeight;
                pdf.addPage();
                pdf.addImage(contentImgData, 'PNG', 0, position, contentPdfWidth, totalContentPDFHeight);
                heightLeft -= pdfHeight;
            }
            
            pdf.save(`inspection-report-${inspection.id}.pdf`);
        } catch (error) {
            console.error("Error exporting to PDF:", error);
            alert("Sorry, there was an error exporting the report to PDF.");
        } finally {
            setIsExporting(false);
            if(templateContainer) templateContainer.classList.add('hidden');
        }
    };


    if (!inspection) return <div className="text-center p-8 text-gray-600 dark:text-gray-400">Report not found.</div>;

    const statusColors: { [key in InspectionStatus]: string } = {
        'Pass': 'text-green-600 dark:text-green-400',
        'Fail': 'text-red-600 dark:text-red-400',
        'N/A': 'text-gray-500 dark:text-gray-400',
    };
    
    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-6 print:hidden">
                <button onClick={onBack} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-md">&larr; Back to Inspections</button>
                <div className="flex gap-2">
                    <button onClick={() => onEdit(inspectionId)} className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md">Edit</button>
                    <button onClick={handleExportPDF} disabled={isExporting} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-md flex items-center justify-center disabled:bg-orange-400">
                        {isExporting ? <><Spinner /> Exporting...</> : 'Export to PDF'}
                    </button>
                    <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md">Print Report</button>
                </div>
            </div>

            <div id="full-report-container">
                <ReportTemplate inspection={inspection} />
                <div id="report-content" className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg border dark:border-gray-700 printable-a4">
                     <header className="border-b-2 border-blue-500 pb-4 mb-8">
                        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100">Property Inspection Report</h1>
                        <p className="text-lg text-gray-600 dark:text-gray-300">{inspection.propertyLocation}</p>
                    </header>
                    
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-8 text-sm">
                        <div className="flex justify-between"><strong className="text-gray-600 dark:text-gray-400">Client:</strong> <span className="text-gray-800 dark:text-gray-200">{inspection.clientName}</span></div>
                        <div className="flex justify-between"><strong className="text-gray-600 dark:text-gray-400">Inspector:</strong> <span className="text-gray-800 dark:text-gray-200">{inspection.inspectorName}</span></div>
                        <div className="flex justify-between"><strong className="text-gray-600 dark:text-gray-400">Date:</strong> <span className="text-gray-800 dark:text-gray-200">{formatDate(inspection.inspectionDate)}</span></div>
                         <div className="flex justify-between"><strong className="text-gray-600 dark:text-gray-400">Property Type:</strong> <span className="text-gray-800 dark:text-gray-200">{inspection.propertyType}</span></div>
                    </div>

                    <div className="mb-8">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-2xl font-bold text-blue-700 dark:text-blue-400 border-b-2 border-blue-200 dark:border-blue-800 pb-2">Executive Summary</h2>
                            {!inspection.aiSummary && (
                                 <button onClick={handleGenerateSummary} disabled={isSummaryLoading} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center gap-2 disabled:bg-blue-300 print:hidden">
                                    {isSummaryLoading ? <><Spinner /> Generating...</> : 'Generate AI Summary'}
                                </button>
                            )}
                        </div>
                        {inspection.aiSummary ? (
                            <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{inspection.aiSummary}</div>
                        ) : (
                            <p className="text-gray-500 dark:text-gray-400 italic">Generate an AI summary for a quick overview of the key findings.</p>
                        )}
                    </div>

                    {inspection.areas.map(area => (
                        <div key={area.id} className="mb-8 break-inside-avoid">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 p-3 rounded-t-md border-b-2 border-blue-500">{area.name}</h3>
                            <div className="border border-t-0 dark:border-gray-600 rounded-b-md">
                               {area.items.length > 0 ? area.items.map(item => (
                                   <div key={item.id} className="p-4 border-b last:border-b-0 dark:border-gray-600 break-inside-avoid-page">
                                        <div className="flex justify-between items-start">
                                            <p className="font-semibold text-gray-900 dark:text-gray-200">{item.point}</p>
                                            <span className={`font-bold text-lg ${statusColors[item.status]}`}>{item.status}</span>
                                        </div>
                                        {item.location && <p className="text-sm text-gray-500 dark:text-gray-400"><strong>Location:</strong> {item.location}</p>}
                                        {item.comments && <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-wrap"><strong>Comments:</strong> {item.comments}</p>}
                                       {item.photos.length > 0 && (
                                           <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                                               {item.photos.map((photo, index) => (
                                                   <img key={index} src={`data:image/jpeg;base64,${photo.base64}`} alt={`${item.point} photo ${index+1}`} className="rounded-md shadow-sm w-full object-cover"/>
                                               ))}
                                           </div>
                                       )}
                                   </div>
                               )) : <p className="p-4 text-gray-500 dark:text-gray-400">No items inspected in this area.</p>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
             <style>{`
                .break-after-page {
                    break-after: page;
                    page-break-after: always;
                }
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
                        width: 210mm;
                        height: 297mm;
                    }
                    #report-content, #invoice-content, .printable-a4 {
                        box-shadow: none !important;
                        border: none !important;
                        color: #000 !important;
                        background-color: #fff !important;
                        margin: 0;
                        padding: 20mm;
                        width: 210mm;
                        height: 297mm;
                        box-sizing: border-box;
                    }
                    #report-content {
                        height: auto;
                    }
                     #full-report-container {
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .dark * {
                        color: #000 !important;
                        background-color: transparent !important;
                        border-color: #ccc !important;
                    }
                    h1, h2, h3 {
                        color: #111827 !important;
                    }
                    .bg-gray-100 {
                        background-color: #f3f4f6 !important;
                    }
                    .border-blue-500 {
                        border-color: #3b82f6 !important;
                    }
                    .break-inside-avoid { page-break-inside: avoid; }
                    .break-inside-avoid-page { page-break-inside: avoid; }
                }
                .printable-a4 {
                    width: 210mm;
                    min-height: 297mm;
                    padding: 20mm; /* Updated for ~1-inch margins */
                    margin: 1rem auto;
                    box-sizing: border-box; /* To include padding in width */
                }
                #report-content.printable-a4 {
                    /* This allows html2canvas to capture the full scroll height */
                    min-height: auto;
                }
            `}</style>
        </div>
    );
};

const InspectionsDashboard: React.FC<{ onView: (id: string) => void; onEdit: (id: string) => void; onCreate: () => void; }> = ({ onView, onEdit, onCreate }) => {
    const { getInspections, deleteInspection } = useInspections();
    const [inspections, setInspections] = useState<InspectionData[]>([]);
    const [filter, setFilter] = useState<string>('All');

    useEffect(() => {
        setInspections(getInspections());
    }, []);

    const handleDelete = (id: string) => {
        if (window.confirm("Are you sure you want to delete this inspection?")) {
            deleteInspection(id);
            setInspections(getInspections());
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
                            className="p-2 border rounded-md w-full bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200"
                        >
                            <option value="All">All Property Types</option>
                            <option value="Apartment">Apartment</option>
                            <option value="Villa">Villa</option>
                            <option value="Building">Building</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <button onClick={onCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md whitespace-nowrap">
                        New Inspection
                    </button>
                </div>
            </div>
            
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border dark:border-gray-700">
                {filteredInspections.length > 0 ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredInspections.map(insp => (
                            <li key={insp.id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                <div>
                                    <h3 className="font-semibold text-lg text-blue-700 dark:text-blue-400">{insp.propertyLocation}</h3>
                                    <p className="text-gray-600 dark:text-gray-300">Client: {insp.clientName}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Date: {formatDate(insp.inspectionDate)} | Type: {insp.propertyType}</p>
                                </div>
                                <div className="flex gap-2 self-end md:self-center">
                                    <button onClick={() => onView(insp.id)} className="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-semibold py-1 px-3 rounded-md text-sm">View Report</button>
                                     <button onClick={() => onEdit(insp.id)} className="bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-900 text-indigo-800 dark:text-indigo-300 font-semibold py-1 px-3 rounded-md text-sm">Edit</button>
                                    <button onClick={() => handleDelete(insp.id)} className="bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900 text-red-800 dark:text-red-300 font-semibold py-1 px-3 rounded-md text-sm">Delete</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-center p-12 text-gray-500 dark:text-gray-400">
                        <h3 className="text-xl font-semibold">No inspections found.</h3>
                        <p>{filter === 'All' ? 'Click "New Inspection" to get started.' : `No inspections match the filter "${filter}".`}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const PlaceholderPage: React.FC<{title: string}> = ({title}) => (
    <div className="flex items-center justify-center h-full">
        <div className="text-center p-12 text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800 rounded-lg shadow-md border dark:border-gray-700">
            <h3 className="text-2xl font-semibold">{title}</h3>
            <p>This section is under construction. Check back soon!</p>
        </div>
    </div>
);

// --- New Dashboard Components ---
const StatCard: React.FC<{ title: string; value: string; change: string; changeType: 'increase' | 'decrease' }> = ({ title, value, change, changeType }) => {
    const isIncrease = changeType === 'increase';
    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow">
            <h4 className="text-sm font-medium text-gray-500 dark:text-slate-400">{title}</h4>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
            {change && (
                 <div className={`text-sm flex items-center mt-2 ${isIncrease ? 'text-green-500' : 'text-red-500'}`}>
                    {isIncrease ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    )}
                    {change}
                </div>
            )}
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
            backgroundColor: '#3b82f6', // blue-500
            borderRadius: 4,
        }],
    };
    
    const pieChartData = {
        labels: dashboardData.pieChartLabels,
        datasets: [{
            data: dashboardData.pieChartDataPoints,
            backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#6b7280'], // emerald-500, red-500, amber-500, gray-500
            borderColor: isDarkMode ? '#1e293b' : '#ffffff', // slate-800 for dark
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
                <StatCard title="Total Inspections" value={dashboardData.totalInspections.toString()} change={`+${dashboardData.inspectionsThisMonth} this month`} changeType="increase" />
                <StatCard title="Total Revenue" value={formatCurrency(dashboardData.totalRevenue, '')} change={`+${formatCurrency(dashboardData.revenueThisMonth, '')} this month`} changeType="increase" />
                <StatCard title="Active Clients" value={dashboardData.totalClients.toString()} change="" changeType="increase" />
                <StatCard title="Overdue Invoices" value={dashboardData.overdueInvoicesCount.toString()} change="" changeType="decrease" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 bg-white dark:bg-slate-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Revenue Overview</h3>
                    <div className="h-72">
                        <Bar options={chartOptions('Revenue Overview')} data={barChartData} />
                    </div>
                </div>
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Invoice Status</h3>
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
    
    const inputClasses = "w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200";

    return (
        <Modal isOpen={true} onClose={onClose} title={client ? "Edit Client" : "Add New Client"} size="xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input name="name" value={formData.name} onChange={handleChange} placeholder="Client Name" required className={inputClasses} />
                    <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Email Address" required className={inputClasses} />
                    <input name="phone" value={formData.phone} onChange={handleChange} placeholder="Phone Number" className={inputClasses} />
                </div>
                <textarea name="address" value={formData.address} onChange={handleChange} placeholder="Client Address" rows={3} className={inputClasses}></textarea>
                
                <div className="border-t dark:border-gray-600 pt-4">
                    <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Properties</h4>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                        {formData.properties.map((prop, index) => (
                            <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md">
                                <input name="location" value={prop.location} onChange={(e) => handlePropertyChange(index, e)} placeholder="Location" required className={`${inputClasses} md:col-span-2`} />
                                <input name="size" type="number" value={prop.size} onChange={(e) => handlePropertyChange(index, e)} placeholder="Size (sqm)" required className={inputClasses} />
                                <div className="flex items-center gap-2">
                                    <select name="type" value={prop.type} onChange={(e) => handlePropertyChange(index, e)} className={`${inputClasses} flex-grow`}>
                                        <option value="Residential">Residential</option>
                                        <option value="Commercial">Commercial</option>
                                    </select>
                                    <button type="button" onClick={() => removeProperty(index)} className="text-red-500 hover:text-red-700 text-2xl">&times;</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addProperty} className="mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-semibold">+ Add Property</button>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded-md">Cancel</button>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">Save Client</button>
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

    useEffect(() => {
        setClients(getClients());
    }, []);

    const handleSave = (client: Client) => {
        saveClient(client);
        setClients(getClients());
    };

    const handleDelete = (id: string) => {
        if (window.confirm("Are you sure you want to delete this client and all their properties?")) {
            deleteClient(id);
            setClients(getClients());
        }
    };
    
    const openModal = (client: Client | null = null) => {
        setEditingClient(client);
        setIsModalOpen(true);
    };

    return (
        <div className="w-full">
            <div className="flex justify-end mb-6">
                <button onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md">
                    Add New Client
                </button>
            </div>

            {isModalOpen && <ClientFormModal client={editingClient || undefined} onClose={() => setIsModalOpen(false)} onSave={handleSave} />}

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border dark:border-gray-700">
                {clients.length > 0 ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {clients.map(client => (
                            <li key={client.id} className="p-4 flex flex-col md:flex-row justify-between items-start gap-4">
                                <div className="flex-1">
                                    <h3 className="font-semibold text-lg text-blue-700 dark:text-blue-400">{client.name}</h3>
                                    <p className="text-gray-600 dark:text-gray-300">{client.email} | {client.phone}</p>
                                    <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                        <strong className="block">Properties:</strong>
                                        {client.properties.length > 0 ? (
                                            <ul className="list-disc pl-5">
                                                {client.properties.map(p => <li key={p.id}>{p.location} ({p.type}, {p.size} sqm)</li>)}
                                            </ul>
                                        ) : "No properties listed."}
                                    </div>
                                </div>
                                <div className="flex gap-2 self-end md:self-start">
                                    <button onClick={() => openModal(client)} className="bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-900 text-indigo-800 dark:text-indigo-300 font-semibold py-1 px-3 rounded-md text-sm">Edit</button>
                                    <button onClick={() => handleDelete(client.id)} className="bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900 text-red-800 dark:text-red-300 font-semibold py-1 px-3 rounded-md text-sm">Delete</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-center p-12 text-gray-500 dark:text-gray-400">
                        <h3 className="text-xl font-semibold">No clients found.</h3>
                        <p>Click "Add New Client" to get started.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- New Invoice Management Components ---
const InvoicesDashboard: React.FC<{ onView: (id: string) => void; onEdit: (id: string) => void; onCreate: () => void; }> = ({ onView, onEdit, onCreate }) => {
    const { getInvoices, deleteInvoice } = useInvoices();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'All'>('All');

    useEffect(() => {
        setInvoices(getInvoices());
    }, []);
    
    const handleDelete = (id: string) => {
        if(window.confirm("Are you sure you want to delete this invoice?")) {
            deleteInvoice(id);
            setInvoices(getInvoices());
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
        'Draft': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };

    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto flex-grow">
                    <input type="text" placeholder="Search by client..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="p-2 border rounded-md w-full sm:w-64 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200" />
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200">
                        <option value="All">All Statuses</option>
                        <option value="Paid">Paid</option>
                        <option value="Unpaid">Unpaid</option>
                        <option value="Partial">Partial</option>
                        <option value="Draft">Draft</option>
                    </select>
                </div>
                <button onClick={onCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md whitespace-nowrap">
                    New Invoice
                </button>
            </div>
            
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border dark:border-gray-700 overflow-x-auto">
                {filteredInvoices.length > 0 ? (
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 dark:bg-slate-700">
                            <tr>
                                <th className="p-4 font-semibold">Invoice #</th>
                                <th className="p-4 font-semibold">Client</th>
                                <th className="p-4 font-semibold">Date</th>
                                <th className="p-4 font-semibold">Due Date</th>
                                <th className="p-4 font-semibold">Amount</th>
                                <th className="p-4 font-semibold">Status</th>
                                <th className="p-4 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredInvoices.map(inv => (
                                <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                    <td className="p-4 font-medium text-blue-600 dark:text-blue-400">{inv.invoiceNumber}</td>
                                    <td className="p-4">{inv.clientName}</td>
                                    <td className="p-4">{formatDate(inv.invoiceDate)}</td>
                                    <td className="p-4">{formatDate(inv.dueDate)}</td>
                                    <td className="p-4 font-mono">{formatCurrency(inv.totalAmount)}</td>
                                    <td className="p-4"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[inv.status]}`}>{inv.status}</span></td>
                                    <td className="p-4">
                                        <div className="flex gap-2">
                                            <button onClick={() => onView(inv.id)} className="text-gray-600 dark:text-gray-300 hover:text-blue-600" title="View"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button>
                                            <button onClick={() => onEdit(inv.id)} className="text-gray-600 dark:text-gray-300 hover:text-indigo-600" title="Edit"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002 2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                            <button onClick={() => handleDelete(inv.id)} className="text-gray-600 dark:text-gray-300 hover:text-red-600" title="Delete"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="text-center p-12 text-gray-500 dark:text-gray-400">
                        <h3 className="text-xl font-semibold">No invoices found.</h3>
                        <p>Click "New Invoice" to create one.</p>
                    </div>
                )}
            </div>
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
                    className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                        selected === template.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    }`}
                >
                    <div className="flex items-center justify-between">
                         <h4 className="font-bold text-lg text-gray-800 dark:text-gray-100">{template.name}</h4>
                         {selected === template.id && (
                             <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                         )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{template.description}</p>
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

    useEffect(() => {
        setClients(getClients());
        const invoiceData = invoiceId ? getInvoiceById(invoiceId) : {
            id: `inv_${Date.now()}`,
            invoiceNumber: `INV-${String(Date.now()).slice(-6)}`,
            invoiceDate: new Date().toISOString().split('T')[0],
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
    const inputClasses = "p-2 border rounded-md w-full bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200";

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
             <div className="bg-white dark:bg-gray-800/50 p-6 rounded-lg shadow-md border dark:border-gray-700">
                <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Invoice Template</h3>
                <TemplateSelector selected={invoice.template || 'classic'} onChange={(t) => handleFieldChange('template', t)} />
            </div>

             <div className="bg-white dark:bg-gray-800/50 p-6 rounded-lg shadow-md border dark:border-gray-700">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Invoice</h2>
                    <input type="text" value={invoice.invoiceNumber} onChange={e => handleFieldChange('invoiceNumber', e.target.value)} className={`${inputClasses} max-w-xs`} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bill To</label>
                        <select value={invoice.clientId} onChange={e => handleClientChange(e.target.value)} required className={inputClasses}>
                            <option value="" disabled>Select a client</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {selectedClient && <div className="text-sm mt-2 text-gray-600 dark:text-gray-400">
                            <p>{selectedClient.address}</p>
                            <p>{selectedClient.email}</p>
                        </div>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Property</label>
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice Date</label>
                        <input type="date" value={invoice.invoiceDate} onChange={e => handleFieldChange('invoiceDate', e.target.value)} className={inputClasses} />
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mt-2 mb-1">Due Date</label>
                        <input type="date" value={invoice.dueDate} onChange={e => handleFieldChange('dueDate', e.target.value)} className={inputClasses} />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800/50 p-6 rounded-lg shadow-md border dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b dark:border-gray-600">
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
                                    <td className="text-center"><button type="button" onClick={() => removeService(index)} className="text-red-500 hover:text-red-700 text-2xl">&times;</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button type="button" onClick={addService} className="mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-semibold">+ Add Line Item</button>
            </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800/50 p-6 rounded-lg shadow-md border dark:border-gray-700">
                    <h3 className="font-semibold mb-2">Notes</h3>
                    <textarea value={invoice.notes} onChange={e => handleFieldChange('notes', e.target.value)} rows={4} className={inputClasses} placeholder="Add any notes for the client..."></textarea>
                </div>
                <div className="bg-white dark:bg-gray-800/50 p-6 rounded-lg shadow-md border dark:border-gray-700 flex flex-col justify-between">
                    <div className="space-y-2 text-right">
                        <div className="flex justify-between items-center"><span className="font-semibold">Subtotal:</span> <span className="font-mono">{formatCurrency(invoice.subtotal)}</span></div>
                        <div className="flex justify-between items-center"><span className="font-semibold">Tax (5%):</span> <span className="font-mono">{formatCurrency(invoice.tax)}</span></div>
                        <div className="flex justify-between items-center text-xl font-bold border-t pt-2 dark:border-gray-600"><span className="">Total:</span> <span className="font-mono">{formatCurrency(invoice.totalAmount)}</span></div>
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
                        <div className="flex justify-between items-center text-lg font-semibold bg-gray-100 dark:bg-gray-700 p-2 rounded-md">
                            <span>Balance Due:</span>
                            <span className="font-mono">{formatCurrency(invoice.totalAmount - invoice.amountPaid)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-4">
                <button type="button" onClick={onCancel} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md">Cancel</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">Save Invoice</button>
            </div>
        </form>
    );
};

const InvoiceViewer: React.FC<{ invoiceId: string; onBack: () => void; onEdit: (id: string) => void; }> = ({ invoiceId, onBack, onEdit }) => {
    const { getInvoiceById } = useInvoices();
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        setInvoice(getInvoiceById(invoiceId));
    }, [invoiceId]);
    
    const handleExportPDF = async () => {
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
        'Draft': 'bg-gray-100 text-gray-800 border-gray-500 dark:bg-gray-700 dark:text-gray-300',
    };

    const templateClass = `invoice-${invoice?.template || 'classic'}`;

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-6 print:hidden">
                <button onClick={onBack} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-md">&larr; Back to Invoices</button>
                <div className="flex gap-2">
                    <button onClick={() => onEdit(invoiceId)} className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md">Edit</button>
                    <button onClick={handleExportPDF} disabled={isExporting} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-md flex items-center justify-center disabled:bg-orange-400">
                        {isExporting ? <><Spinner /> Exporting...</> : 'Export to PDF'}
                    </button>
                </div>
            </div>

            <div id="invoice-content" className={`bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg border dark:border-gray-700 printable-a4 ${templateClass}`}>
                 <header className="flex justify-between items-start pb-4 mb-8 border-b-2 dark:border-gray-600">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100">INVOICE</h1>
                        <p className="text-lg text-gray-600 dark:text-gray-300">Inspector Pro</p>
                    </div>
                    <div className="text-right">
                        <p><strong className="text-gray-600 dark:text-gray-400">Invoice #:</strong> {invoice.invoiceNumber}</p>
                        <p><strong className="text-gray-600 dark:text-gray-400">Date:</strong> {formatDate(invoice.invoiceDate)}</p>
                        <p><strong className="text-gray-600 dark:text-gray-400">Due Date:</strong> {formatDate(invoice.dueDate)}</p>
                    </div>
                </header>
                
                <div className="grid grid-cols-2 gap-8 mb-8">
                    <div>
                        <h3 className="font-semibold text-gray-500 dark:text-gray-400 mb-1">BILLED TO</h3>
                        <p className="font-bold text-lg text-gray-800 dark:text-gray-200">{invoice.clientName}</p>
                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{invoice.clientAddress}</p>
                        <p className="text-gray-700 dark:text-gray-300">{invoice.clientEmail}</p>
                    </div>
                    <div className={`text-center self-center justify-self-end p-4 border-2 rounded-lg ${statusClasses[invoice.status]}`}>
                        <span className="text-2xl font-bold tracking-widest uppercase">{invoice.status}</span>
                    </div>
                </div>

                <table className="w-full mb-8">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                            <th className="p-3 text-left font-bold text-gray-700 dark:text-gray-200">Description</th>
                            <th className="p-3 text-right font-bold text-gray-700 dark:text-gray-200">Quantity</th>
                            <th className="p-3 text-right font-bold text-gray-700 dark:text-gray-200">Unit Price</th>
                            <th className="p-3 text-right font-bold text-gray-700 dark:text-gray-200">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
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
                        <div className="flex justify-between py-2"><span className="text-gray-600 dark:text-gray-400">Subtotal:</span> <span className="font-mono">{formatCurrency(invoice.subtotal)}</span></div>
                        <div className="flex justify-between py-2"><span className="text-gray-600 dark:text-gray-400">Tax (5%):</span> <span className="font-mono">{formatCurrency(invoice.tax)}</span></div>
                        <div className="flex justify-between py-2 font-bold text-lg border-t-2 dark:border-gray-600"><span className="text-gray-800 dark:text-gray-200">Total:</span> <span className="font-mono text-gray-800 dark:text-gray-200">{formatCurrency(invoice.totalAmount)}</span></div>
                        <div className="flex justify-between py-2"><span className="text-gray-600 dark:text-gray-400">Amount Paid:</span> <span className="font-mono">{formatCurrency(invoice.amountPaid)}</span></div>
                        <div className="flex justify-between p-3 mt-2 text-xl font-bold rounded-lg balance-due-box"><span className="text-gray-800 dark:text-gray-200">Balance Due:</span> <span className="font-mono text-gray-800 dark:text-gray-200">{formatCurrency(invoice.totalAmount - invoice.amountPaid)}</span></div>
                    </div>
                </div>
                
                {invoice.notes && <div className="border-t pt-4 dark:border-gray-600">
                    <h4 className="font-semibold text-gray-500 dark:text-gray-400 mb-1">Notes</h4>
                    <p className="text-gray-700 dark:text-gray-300">{invoice.notes}</p>
                </div>}

                <footer className="text-center text-xs text-gray-500 dark:text-gray-400 pt-8 mt-8 border-t dark:border-gray-600">
                    <p>Thank you for your business!</p>
                    <p>Inspector Pro | inspectpro.example.com | contact@inspectpro.example.com</p>
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
                    border-bottom-width: 2px;
                }
                .invoice-classic table thead {
                    background-color: #f3f4f6; /* gray-100 */
                }
                .dark .invoice-classic table thead {
                    background-color: #374151; /* gray-700 */
                }
                .invoice-classic .balance-due-box {
                     background-color: #f3f4f6; /* gray-100 */
                     border: 1px solid #e5e7eb; /* gray-200 */
                }
                 .dark .invoice-classic .balance-due-box {
                     background-color: #374151; /* gray-700 */
                     border-color: #4b5563; /* gray-600 */
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
                .invoice-modern table thead {
                    background-color: transparent;
                    border-bottom: 2px solid #3b82f6; /* blue-500 */
                }
                .invoice-modern table thead th {
                     color: #3b82f6;
                }
                .dark .invoice-modern table thead th {
                     color: #60a5fa; /* blue-400 */
                }
                .invoice-modern .balance-due-box {
                     background-color: #3b82f6; /* blue-500 */
                     color: white;
                }
                .dark .invoice-modern .balance-due-box {
                     background-color: #3b82f6; /* blue-500 */
                }
                .dark .invoice-modern .balance-due-box span {
                    color: white !important;
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
                    background-color: #374151; /* gray-700 */
                }
                
                @media print {
                    body { -webkit-print-color-adjust: exact; color-adjust: exact; }
                    .print\\:hidden { display: none !important; }
                    html, body {
                        background-color: #fff !important;
                        color: #000 !important;
                    }
                    #report-content, #invoice-content {
                        box-shadow: none !important;
                        border: none !important;
                        color: #000 !important;
                        background-color: #fff !important;
                    }
                    .dark * {
                        color: #000 !important;
                        background-color: transparent !important;
                        border-color: #ccc !important;
                    }
                    .break-inside-avoid { page-break-inside: avoid; }
                    .break-inside-avoid-page { page-break-inside: avoid; }
                }
                .printable-a4 {
                    width: 210mm;
                    min-height: 297mm;
                    padding: 15mm;
                    margin: 0 auto;
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


const App: React.FC = () => {
    const [activePage, setActivePage] = useState<Page>('dashboard');
    const [inspectionView, setInspectionView] = useState<InspectionViewState>({ page: 'inspections-list' });
    const [invoiceView, setInvoiceView] = useState<InvoiceViewState>({ page: 'invoices-list' });

    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (localStorage.theme === 'dark') return true;
        if (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
        return false;
    });

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

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
    };

    const renderPage = () => {
        switch (activePage) {
            case 'dashboard': return <Dashboard />;
            case 'inspections': return renderInspectionsView();
            case 'clients': return <ClientsPage />;
            case 'invoices': return renderInvoicesView();
            case 'reports': return <PlaceholderPage title="Reports" />;
            case 'settings': return <PlaceholderPage title="Settings" />;
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
            className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
                activePage === page 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-300 hover:bg-slate-700 hover:text-white'
            }`}
        >
            {icon}
            <span className="ml-3">{children}</span>
        </a>
    );

    return (
        <div className="flex h-screen bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-slate-300">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 bg-slate-800 dark:bg-slate-800 text-white flex flex-col">
                 <div className="h-16 flex items-center justify-center px-4 bg-slate-900 dark:bg-slate-900">
                    <h1 className="text-xl font-bold">Inspector Pro</h1>
                </div>
                <nav className="flex-1 px-4 py-4 space-y-2">
                    <NavLink page="dashboard" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>}>Dashboard</NavLink>
                    <NavLink page="inspections" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}>Inspections</NavLink>
                    <NavLink page="clients" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}>Clients</NavLink>
                    <NavLink page="invoices" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}>Invoices</NavLink>
                    <NavLink page="reports" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}>Reports</NavLink>
                    <NavLink page="settings" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.096 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}>Settings</NavLink>
                </nav>
                <div className="mt-auto p-4 border-t border-slate-700">
                    <p className="text-xs text-center text-gray-400">&copy; 2024 Inspector Pro. All Rights Reserved.</p>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white dark:bg-slate-800 shadow-sm z-10">
                    <div className="container mx-auto px-6 py-3 flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{pageTitles[activePage]}</h2>
                        <div className="flex items-center space-x-4">
                            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 ring-1 ring-blue-500">
                                {isDarkMode ? 
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg> :
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                                }
                            </button>
                            <button className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 relative">
                                <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800"></span>
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                            </button>
                             <img className="h-8 w-8 rounded-full object-cover" src="https://i.pravatar.cc/40" alt="User avatar" />
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
