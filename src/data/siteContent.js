export const TRUCK_INFO = {
  name: 'Isuzu Giga 6UZ1',
  type: '10 Wheeler Wingvan',
  color: 'Green fleet unit',
  image: '/box_truck.png',
  highlights: [
    'Ideal for imported goods arriving in Manila ports',
    'Built for Luzon, Visayas, and Mindanao forwarding routes',
    'Wingvan body supports faster loading and unloading',
  ],
};

export const FLEET = [
  {
    id: 'wingvan-10',
    name: 'Isuzu Giga 6UZ1',
    type: '10-Wheeler Wingvan',
    capacity: '15,000 kg',
    dimensions: '32 x 8 x 8 ft',
    image: '/UPSCALES.jpg',
    bestFor: 'Inter-island cargo, heavy bulk deliveries, and palletized goods',
    highlights: ['Hydraulic wing doors for fast forklift access', 'Air suspension for fragile cargo', 'GPS tracked'],
  },
  {
    id: 'forward-6',
    name: 'Fuso Fighter',
    type: '6-Wheeler Forward',
    capacity: '7,000 kg',
    dimensions: '20 x 7 x 7 ft',
    image: '/box_truck.png',
    bestFor: 'Provincial distribution and medium-scale transfers',
    highlights: ['High-clearance for rough provincial roads', 'Secure aluminum box', 'Fuel efficient'],
  },
  {
    id: 'elf-6',
    name: 'Mitsubishi Canter',
    type: '6-Wheeler Closed Van',
    capacity: '4,000 kg',
    dimensions: '14 x 6 x 6 ft',
    image: '/refrigerated_truck.png',
    bestFor: 'Last-mile delivery and city-to-province express',
    highlights: ['Compact for narrow streets', 'Fast loading', 'Perfect for FMCG'],
  },
  {
    id: 'tractor-40',
    name: 'Hino Profia',
    type: 'Tractor Head & Flatbed',
    capacity: '30,000 kg',
    dimensions: '40ft container capacity',
    image: '/flatbed_truck.png',
    bestFor: 'Port pulls, heavy machinery, and containerized cargo',
    highlights: ['Heavy-duty towing', 'Twist locks for shipping containers', 'Long haul ready'],
  }
];

export const SERVICE_LANES = [
  'Manila to Mindanao',
  'Mindanao to Luzon',
  'Luzon to Visayas',
  'Visayas to Mindanao',
];

export const CONTACT_PHONE = process.env.NEXT_PUBLIC_AHV_PHONE || '';
export const CONTACT_PHONE_LABEL = process.env.NEXT_PUBLIC_AHV_PHONE_LABEL || CONTACT_PHONE;
