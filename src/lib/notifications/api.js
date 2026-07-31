import { apiFetch, bearerHeaders, sessionExpiredMessage } from '../http/apiClient.js';

export async function getNotifications(accessToken, { limit = 12, days = 3 } = {}) {
  if (!accessToken) {
    throw new Error(sessionExpiredMessage('view notifications'));
  }

  const params = new URLSearchParams({
    limit: String(limit),
    days: String(days),
  });

  return apiFetch(`/api/notifications?${params.toString()}`, {
    headers: bearerHeaders(accessToken),
    credentials: 'omit',
    cache: 'no-store',
    authAction: 'view notifications',
  }, 'Could not load notifications.');
}
