export async function readJson(response) {
  return response.json().catch(() => ({}));
}

export function sessionExpiredMessage(action = 'continue') {
  return `Your login session expired. Please sign in again to ${action}.`;
}

export async function apiFetch(url, options = {}, fallbackMessage = 'Request failed.') {
  let response;
  const { authAction, ...fetchOptions } = options;

  try {
    response = await fetch(url, fetchOptions);
  } catch {
    throw new Error('Could not reach the server. Please check your connection and try again.');
  }

  const payload = await readJson(response);

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(authAction ? sessionExpiredMessage(authAction) : 'Your login session expired. Please sign in again.');
    }

    throw new Error(payload.error || fallbackMessage);
  }

  return payload;
}

export function bearerHeaders(accessToken, extraHeaders = {}) {
  if (!accessToken) {
    throw new Error(sessionExpiredMessage('continue'));
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    ...extraHeaders,
  };
}
