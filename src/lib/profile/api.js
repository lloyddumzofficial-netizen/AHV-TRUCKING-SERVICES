export function isProfileComplete(profile) {
  return Boolean(profile?.full_name && profile?.phone && profile?.location && profile?.profile_image_url);
}

export async function getProfile(accessToken) {
  const response = await fetch('/api/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'omit',
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not load profile.');
  }

  return payload.profile;
}

export async function saveProfile(accessToken, profile) {
  const response = await fetch('/api/profile', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'omit',
    body: JSON.stringify(profile),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not save profile.');
  }

  return payload.profile;
}

export async function uploadProfilePhoto(accessToken, file) {
  if (!accessToken) {
    throw new Error('Your login session expired. Please sign in again before uploading your profile photo.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploadType', 'profile');

  let response;

  try {
    response = await fetch('/api/uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: 'omit',
      body: formData,
    });
  } catch {
    throw new Error('Could not reach the upload server. Please check your connection and try again.');
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(payload.error || 'Your login session expired. Please sign in again before uploading your profile photo.');
    }

    throw new Error(payload.error || 'Could not upload profile photo.');
  }

  return {
    key: payload.key,
    publicUrl: payload.publicUrl,
  };
}
