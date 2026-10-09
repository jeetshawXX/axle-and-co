const TOKEN_KEY = 'axle.token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } };

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details || {}; }
}

/** Small fetch wrapper: JSON in/out, bearer token, and errors that carry the server's message. */
export async function api(path, { method = 'GET', body, params } = {}) {
  const url = new URL('/api' + path, window.location.origin);
  if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  const token = getToken();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong', data.details);
  return data;
}
