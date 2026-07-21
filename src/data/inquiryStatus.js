export const INQUIRY_STATUSES = [
  'new',
  'reviewing',
  'quoted',
  'accepted',
  'scheduled',
  'for_pickup',
  'picked_up',
  'in_transit',
  'delivered',
  'cancelled',
];

export const INQUIRY_STATUS_LABELS = {
  new: 'New',
  reviewing: 'Reviewing',
  quoted: 'Quoted',
  accepted: 'Accepted',
  scheduled: 'Scheduled',
  for_pickup: 'For Pickup',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  booked: 'Scheduled',
  completed: 'Delivered',
};

export const INQUIRY_STATUS_HELP = {
  new: 'Fresh client request received',
  reviewing: 'AHV is checking cargo fit, route, and availability',
  quoted: 'Price and route estimate sent to client',
  accepted: 'Client accepted the quote',
  scheduled: 'Pickup and delivery schedule prepared',
  for_pickup: 'Truck is preparing or heading to pickup',
  picked_up: 'Cargo has been loaded or picked up',
  in_transit: 'Cargo is moving toward the destination',
  delivered: 'Cargo delivered or request closed',
  cancelled: 'Stopped or rejected',
  booked: 'Pickup and delivery schedule prepared',
  completed: 'Cargo delivered or request closed',
};
