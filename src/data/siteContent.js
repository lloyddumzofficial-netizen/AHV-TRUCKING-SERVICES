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

export const SERVICE_LANES = [
  'Manila to Mindanao',
  'Mindanao to Luzon',
  'Luzon to Visayas',
  'Visayas to Mindanao',
];

export const CONTACT_PHONE = process.env.NEXT_PUBLIC_AHV_PHONE || '';
export const CONTACT_PHONE_LABEL = process.env.NEXT_PUBLIC_AHV_PHONE_LABEL || CONTACT_PHONE;
