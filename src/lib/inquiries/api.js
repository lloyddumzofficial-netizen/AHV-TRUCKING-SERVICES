export async function getInquiries(accessToken, filters = {}) {
  const params = new URLSearchParams();

  if (filters.reference) {
    params.set('reference', filters.reference);
  }

  if (filters.limit) {
    params.set('limit', String(filters.limit));
  }

  const queryString = params.toString();
  const response = await fetch(`/api/inquiries${queryString ? `?${queryString}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not load inquiries.');
  }

  return payload;
}

export async function createInquiry(accessToken, inquiry) {
  const response = await fetch('/api/inquiries', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(inquiry),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not save inquiry.');
  }

  return payload;
}

export async function updateInquiryLocations(accessToken, reference, locations) {
  const response = await fetch('/api/inquiries', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reference,
      ...locations,
    }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not update inquiry locations.');
  }

  return payload;
}

export async function uploadCargoImages(accessToken, reference, images) {
  const uploaded = [];

  for (const image of images) {
    const formData = new FormData();
    formData.append('file', image.file);
    formData.append('uploadType', 'cargo');
    formData.append('reference', reference);

    const response = await fetch('/api/uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Could not upload cargo image to Cloudflare R2.');
    }

    uploaded.push({
      key: payload.key,
      publicUrl: payload.publicUrl,
      name: image.file.name,
      url: payload.publicUrl,
    });
  }

  return uploaded;
}
