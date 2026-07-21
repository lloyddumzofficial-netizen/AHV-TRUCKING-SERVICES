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

  const response = await fetch(`/api/admin/inquiries?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not load admin inquiries.');
  }

  return payload;
}

export async function updateAdminInquiry(accessToken, reference, updates) {
  const response = await fetch(`/api/admin/inquiries/${encodeURIComponent(reference)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not update inquiry.');
  }

  return payload;
}
