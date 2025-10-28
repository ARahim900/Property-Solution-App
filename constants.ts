import { Client, PredefinedService } from './types';

export const INSPECTION_CATEGORIES: { [key: string]: string[] } = {
    "Structural & Interior": [
        "Hairline Cracks", "Ceilings", "Walls", "Floors", "Doors & Locks",
        "Wardrobes & Cabinets Functionality", "Switch Logic & Placement",
        "Stoppers & Door Closers", "Window Lock & Roller Mechanism", "Curtain Box Provision"
    ],
    "Safety / Utility": [
        "Access Panel for AC Maintenance", "Water Heater Installation Check",
        "Water Pump Operational Test", "Fire Alarm/Smoke Detector Test"
    ],
    "Plumbing System": [
        "Water Pressure & Flow", "Pipes & Fittings", "Sinks, Showers, Toilets",
        "Hot Water System", "Water Tank Status (Cleaning)", "Under-Sink Leaks",
        "Drainage Flow Speed", "Toilet Flushing Pressure", "Drain Ventilation (Gurgling Sounds)"
    ],
    "Moisture & Thermal": ["Signs of Damp or Mold", "Thermal Imaging"],
    "Kitchen Inspection": [
        "Cabinet Quality & Alignment", "Countertops & Backsplash",
        "Sink & Mixer Tap Functionality", "Kitchen Appliances"
    ],
    "HVAC System": ["AC Units", "Ventilation Fans", "Thermostat Functionality"],
    "Fire & Safety": ["Smoke Detectors", "Fire Extinguishers"],
    "Finishing & Aesthetics": ["Paint Finish", "Joinery (wardrobes, cabinets)", "Flooring Condition"],
    "External Inspection": ["Roof Condition", "Walls & Paint", "Drainage", "Windows & Doors"],
    "External Area": [
        "Balcony Drainage Test", "Tiling Level & Grouting",
        "Lighting in Outdoor Areas", "External Tap Functionality"
    ],
    "Electrical System": [
        "Main Distribution Board (DB)", "Sockets & Switches", "Lighting Fixtures",
        "Grounding & Earthing", "DB Labeling", "All Light Points Working",
        "All Power Outlets Tested", "AC Drainage Check", "Isolators for AC & Heater",
        "Telephone/Internet Outlet Presence", "Bell/Intercom Functionality"
    ],
    "Bathroom Inspection": [
        "Tiling & Grouting", "Waterproofing Issues", "Toilet Flushing",
        "Water Pressure", "Toilets/Wet Areas Floor Slope", "Exhaust Fan Working",
        "Glass Shower Partition Sealing"
    ]
};

export const PREDEFINED_SERVICES: PredefinedService[] = [
  { name: 'Standard Inspection', description: 'Standard Residential Property Inspection', unitPrice: 150 },
  { name: 'Re-inspection', description: 'Follow-up inspection for previously identified issues', unitPrice: 75 },
  { name: 'Plumbing Check', description: 'Detailed visual inspection of the plumbing system', unitPrice: 100 },
  { name: 'Electrical Audit', description: 'Detailed visual inspection of the electrical system', unitPrice: 100 },
  { name: 'Commercial Inspection (per sqm)', description: 'Commercial Property Inspection', unitPrice: 2 },
];

export const MOCK_CLIENTS: Client[] = [
    {
        id: 'client_1',
        name: 'Ahmed Al Farsi',
        email: 'ahmed.farsi@email.com',
        phone: '91234567',
        address: 'Villa 123, Al Mouj\nMuscat, Oman',
        properties: [
            { id: 'prop_1a', location: 'Villa 123, Al Mouj', type: 'Residential', size: 350 },
            { id: 'prop_1b', location: 'Office 404, Knowledge Oasis', type: 'Commercial', size: 120 },
        ],
    },
    {
        id: 'client_2',
        name: 'Fatima Al Balushi',
        email: 'fatima.b@email.com',
        phone: '98765432',
        address: 'Apartment 7B, Qurum Heights\nMuscat, Oman',
        properties: [
            { id: 'prop_2a', location: 'Apt 7B, Qurum Heights', type: 'Residential', size: 180 },
        ],
    },
    {
        id: 'client_3',
        name: 'Global Investments LLC',
        email: 'contact@globalinvest.com',
        phone: '24601122',
        address: 'PO Box 500, PC 112\nRuwi, Oman',
        properties: [
            { id: 'prop_3a', location: 'Warehouse #5, Rusayl Industrial', type: 'Commercial', size: 1500 },
            { id: 'prop_3b', location: 'Building C, Ghala Heights', type: 'Commercial', size: 2500 },
        ],
    },
];
