// Field validation for the inquiry wizard, mirroring the server rules in
// src/app/api/inquiries/route.js so the two cannot drift.
//
// The wizard wraps all five steps in one <form>, so the `required`/`pattern`
// attributes on step 1 only fired at final submit — by which time those inputs
// were unmounted and never validated. Step gating was a bare truthiness check on
// trimmed strings, so a phone of "abc" passed step 1, the user completed all five
// steps, the photos uploaded to R2, and only then did the server reject it with a
// 400 (leaving the uploads orphaned).

export const NAME_MIN_LENGTH = 4;
export const NAME_PATTERN = /[a-zA-Z]/;
export const PH_MOBILE_PATTERN = /^(09|\+639)\d{9}$/;
export const MIN_ROUTE_DISTANCE_KM = 1;

/** @returns {string|null} error message, or null when valid */
export function validateName(value) {
  const name = (value || '').trim();
  if (!name) return 'Full name is required.';
  if (name.length < NAME_MIN_LENGTH) return `Full name must be at least ${NAME_MIN_LENGTH} characters.`;
  if (!NAME_PATTERN.test(name)) return 'Full name must contain at least one letter.';
  if (name.length > 100) return 'Full name must be 100 characters or fewer.';
  return null;
}

export function validatePhone(value) {
  const phone = (value || '').trim();
  if (!phone) return 'Mobile number is required.';
  if (!PH_MOBILE_PATTERN.test(phone)) {
    return 'Use a Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX.';
  }
  return null;
}

export function validateAddress(value, label) {
  const address = (value || '').trim();
  if (!address) return `${label} is required.`;
  if (address.length < 4) return `${label} looks too short.`;
  return null;
}

export function validateQuantity(value) {
  const quantity = Number(value);
  if (!value || !Number.isFinite(quantity)) return 'Quantity is required.';
  if (!Number.isInteger(quantity) || quantity < 1) return 'Quantity must be a whole number of 1 or more.';
  if (quantity > 10000) return 'Quantity looks too large. Contact AHV directly for bulk moves.';
  return null;
}

export function validateWeight(value) {
  if (value === '' || value === null || value === undefined) return null; // optional
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0) return 'Weight must be a positive number.';
  if (weight > 100000) return 'Weight looks too large. Contact AHV directly.';
  return null;
}

/**
 * Errors for one wizard step, keyed by field name. An empty object means the
 * step may be advanced.
 */
export function validateStep(step, { form, pickup, delivery, routeDistance, images }) {
  const errors = {};

  if (step === 1) {
    const name = validateName(form.name);
    if (name) errors.name = name;
    const phone = validatePhone(form.phone);
    if (phone) errors.phone = phone;
  }

  if (step === 2) {
    const pickupAddress = validateAddress(form.pickupAddress, 'Pickup address');
    if (pickupAddress) errors.pickupAddress = pickupAddress;
    const deliveryAddress = validateAddress(form.deliveryAddress, 'Delivery address');
    if (deliveryAddress) errors.deliveryAddress = deliveryAddress;
    if (!pickup) errors.pickup = 'Drop a pickup pin on the map.';
    if (!delivery) errors.delivery = 'Drop a delivery pin on the map.';
    if (routeDistance !== null && routeDistance < MIN_ROUTE_DISTANCE_KM) {
      errors.routeDistance = `Pickup and delivery are too close. Minimum route distance is ${MIN_ROUTE_DISTANCE_KM} km.`;
    }
  }

  if (step === 3) {
    if (!form.cargoType) errors.cargoType = 'Choose a cargo type.';
    const quantity = validateQuantity(form.quantity);
    if (quantity) errors.quantity = quantity;
    const weight = validateWeight(form.weight);
    if (weight) errors.weight = weight;
  }

  if (step === 4) {
    if (!images || images.length === 0) {
      errors.images = 'At least one parcel photo is required.';
    }
  }

  return errors;
}

/** First error message for a step, for use as a disabled-button explanation. */
export function firstStepError(step, context) {
  const errors = validateStep(step, context);
  const keys = Object.keys(errors);
  return keys.length > 0 ? errors[keys[0]] : null;
}
