import { apiFetch, bearerHeaders, sessionExpiredMessage } from '../http/apiClient.js';

export function isProfileComplete(profile) {
  return Boolean(profile?.full_name && profile?.phone && profile?.location && profile?.profile_image_url);
}

export async function getProfile(accessToken) {
  if (!accessToken) {
    throw new Error(sessionExpiredMessage('load your profile'));
  }

  const payload = await apiFetch('/api/profile', {
    headers: bearerHeaders(accessToken),
    credentials: 'omit',
    authAction: 'load your profile',
  }, 'Could not load profile.');

  return payload.profile;
}

export async function saveProfile(accessToken, profile) {
  if (!accessToken) {
    throw new Error(sessionExpiredMessage('save your profile'));
  }

  const payload = await apiFetch('/api/profile', {
    method: 'PUT',
    headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
    credentials: 'omit',
    body: JSON.stringify(profile),
    authAction: 'save your profile',
  }, 'Could not save profile.');

  return payload.profile;
}

export async function uploadProfilePhoto(accessToken, file) {
  if (!accessToken) {
    throw new Error(sessionExpiredMessage('upload your profile photo'));
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploadType', 'profile');

  const payload = await apiFetch('/api/uploads', {
    method: 'POST',
    headers: bearerHeaders(accessToken),
    credentials: 'omit',
    body: formData,
    authAction: 'upload your profile photo',
  }, 'Could not upload profile photo.');

  return {
    key: payload.key,
    publicUrl: payload.publicUrl,
  };
}
