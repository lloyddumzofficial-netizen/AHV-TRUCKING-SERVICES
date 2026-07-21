export function isProfileComplete(profile) {
  return Boolean(profile?.full_name && profile?.phone && profile?.location && profile?.profile_image_url);
}

export async function getProfile(accessToken) {
  const response = await fetch('/api/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
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
    body: JSON.stringify(profile),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not save profile.');
  }

  return payload.profile;
}

export async function uploadProfilePhoto(accessToken, file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploadType', 'profile');

  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not upload profile photo.');
  }

  return {
    key: payload.key,
    publicUrl: payload.publicUrl,
  };
}
