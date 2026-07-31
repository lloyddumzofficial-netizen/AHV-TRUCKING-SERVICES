import { apiFetch, bearerHeaders } from '../http/apiClient.js';

export async function getAdminInquiries(accessToken, filters = {}) {
  const params = new URLSearchParams();

  if (filters.status && filters.status !== 'all') {
    params.set('status', filters.status);
  }

  if (filters.search) {
    params.set('search', filters.search);
  }

  if (filters.page) {
    params.set('page', String(filters.page));
  }

  if (filters.pageSize) {
    params.set('pageSize', String(filters.pageSize));
  }

  return apiFetch(`/api/admin/inquiries?${params.toString()}`, {
    headers: bearerHeaders(accessToken),
    cache: 'no-store',
    authAction: 'load admin inquiries',
  }, 'Could not load admin inquiries.');
}

export async function updateAdminInquiry(accessToken, reference, updates) {
  return apiFetch(`/api/admin/inquiries/${encodeURIComponent(reference)}`, {
    method: 'PATCH',
    headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(updates),
    authAction: 'update inquiry',
  }, 'Could not update inquiry.');
}

export async function deleteAdminInquiry(accessToken, reference) {
  return apiFetch(`/api/admin/inquiries/${encodeURIComponent(reference)}`, {
    method: 'DELETE',
    headers: bearerHeaders(accessToken),
    authAction: 'delete inquiry',
  }, 'Could not delete inquiry.');
}

export async function generateAdminDriverLink(accessToken, reference) {
  return apiFetch(`/api/admin/inquiries/${encodeURIComponent(reference)}/driver-link`, {
    method: 'POST',
    headers: bearerHeaders(accessToken),
    authAction: 'generate driver tracking link',
  }, 'Could not generate tracking link.');
}
