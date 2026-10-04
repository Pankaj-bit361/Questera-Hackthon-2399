import { API_BASE_URL } from '../config';
import { getAuthToken, logout } from './velosStorage';

// Every request to the Velos API carries the login token, including the few components that call fetch directly.
// When the API says the login is gone (401), the session is cleared and the user goes to the login page.

const PUBLIC_PAGES = ['/', '/login', '/pricing', '/privacy-policy', '/terms-of-service'];

export function installAuthFetch() {
  if (window.__velosAuthFetch) return;
  window.__velosAuthFetch = true;
  const base = API_BASE_URL.replace(/\/+$/, '');
  const original = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(base) || /\/auth\/(google|send-otp|verify-otp)$/.test(url)) return original(input, init);

    const token = getAuthToken();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    const response = await original(input, { ...init, headers });

    if (response.status === 401 && token && !PUBLIC_PAGES.includes(window.location.pathname)) {
      logout();
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    return response;
  };
}
