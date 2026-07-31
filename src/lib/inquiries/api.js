import { apiFetch, bearerHeaders } from '../http/apiClient.js';

export async function getInquiries(accessToken, filters = {}) {
  const params = new URLSearchParams();

  if (filters.reference) {
    params.set('reference', filters.reference);
  }

  if (filters.limit) {
    params.set('limit', String(filters.limit));
  }

  const queryString = params.toString();
  return apiFetch(`/api/inquiries${queryString ? `?${queryString}` : ''}`, {
    headers: bearerHeaders(accessToken),
    credentials: 'omit',
    cache: 'no-store',
    authAction: 'load inquiries',
  }, 'Could not load inquiries.');
}

/**
 * Whether the signed-in user may submit an inquiry right now.
 *
 * Call this before uploading cargo photos: the cooldown and active-inquiry cap
 * were previously only discovered from POST /api/inquiries, which runs after the
 * upload, leaving orphaned objects in R2 on a 429.
 */
export async function getInquiryQuota(accessToken) {
  return apiFetch('/api/inquiries/quota', {
    headers: bearerHeaders(accessToken),
    credentials: 'omit',
    cache: 'no-store',
    authAction: 'check your submission limit',
  }, 'Could not check your submission limit.');
}

export async function createInquiry(accessToken, inquiry) {
  return apiFetch('/api/inquiries', {
    method: 'POST',
    headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
    credentials: 'omit',
    body: JSON.stringify(inquiry),
    authAction: 'save inquiry',
  }, 'Could not save inquiry.');
}

export async function updateInquiryLocations(accessToken, reference, locations) {
  return apiFetch('/api/inquiries', {
    method: 'PATCH',
    headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
    credentials: 'omit',
    body: JSON.stringify({
      reference,
      ...locations,
    }),
    authAction: 'update inquiry locations',
  }, 'Could not update inquiry locations.');
}

export async function uploadCargoImages(accessToken, reference, images) {
  const uploaded = [];

  for (const image of images) {
    const formData = new FormData();
    formData.append('file', image.file);
    formData.append('uploadType', 'cargo');
    formData.append('reference', reference);

    const payload = await apiFetch('/api/uploads', {
      method: 'POST',
      headers: bearerHeaders(accessToken),
      credentials: 'omit',
      body: formData,
      authAction: 'upload cargo images',
    }, 'Could not upload cargo image to Cloudflare R2.');

    uploaded.push({
      key: payload.key,
      publicUrl: payload.publicUrl,
      name: image.file.name,
      url: payload.publicUrl,
    });
  }

  return uploaded;
}
