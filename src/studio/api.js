import { API_BASE_URL } from '../config';
import { getAuthToken } from '../lib/velosStorage';

// In development the Studio API runs locally (npm run studio:dev) behind Vite's /api/studio proxy, with a local session.
const BASE = import.meta.env.DEV ? '/api/studio' : `${API_BASE_URL}/studio`;

let localToken;
async function token() {
  if (!import.meta.env.DEV) return getAuthToken();
  if (!localToken) {
    const response = await fetch(`${BASE}/local-session`, { method: 'POST', headers: { 'X-Studio-Local': '1' } });
    if (!response.ok) throw new Error('Start the Studio API with npm run studio:dev.');
    localToken = (await response.json()).token;
  }
  return localToken;
}

export async function request(path, method = 'GET', body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return null;
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Studio is unavailable right now. Check your connection and try again.');
  }
  if (!response.ok) throw Object.assign(new Error(result.error || 'Something went wrong.'), { status: response.status });
  return result;
}

/** Send a file as the raw request body (screenshots); its name goes in a header. */
export async function upload(path, file) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name || '') },
    body: file,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'That upload didn’t work. Try again.');
  return result;
}

// Every poll returns a freshly signed ticket. Reusing one per job (tickets last 6 hours) keeps file URLs stable, so a
// video that is playing isn't reloaded while the rest of the job is still rendering.
const tickets = new Map();
function ticket(job) {
  const held = tickets.get(job.id);
  if (held && Date.now() - held.at < 5 * 3600 * 1000) return held.t;
  tickets.set(job.id, { t: job.fileToken, at: Date.now() });
  return job.fileToken;
}

/** For the live preview: where a job's files are, the ticket query that signs them, and the music and effects. */
export const filesBase = (job) => `${BASE}/files/${job.id}`;
export const fileQuery = (job) => `?t=${encodeURIComponent(ticket(job))}`;
export const audioBase = `${BASE}/audio`;

/** A URL for a file inside a job (captured screens, logo, videos), signed by the job's file ticket. `download` names the saved file. */
export const fileUrl = (job, rel, download) => `${BASE}/files/${job.id}/${rel}?t=${encodeURIComponent(ticket(job))}${download ? `&download=${encodeURIComponent(download)}` : ''}`;
