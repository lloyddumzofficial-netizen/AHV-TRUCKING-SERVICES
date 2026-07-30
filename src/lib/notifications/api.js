export async function getNotifications(accessToken, { limit = 12, days = 3 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    days: String(days),
  });

  const response = await fetch(`/api/notifications?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'omit',
    cache: 'no-store',
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not load notifications.');
  }

  return payload;
}
