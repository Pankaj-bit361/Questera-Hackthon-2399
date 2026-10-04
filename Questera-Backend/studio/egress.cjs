// The capture browser's only way out: a small proxy on loopback that resolves every host itself and refuses private,
// loopback and link-local addresses — including public names that resolve to them — so a website can't steer the
// browser into the worker's own network or the cloud metadata and credential endpoints (169.254.169.254, 169.254.170.2).

const dns = require('node:dns/promises');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const strict = () => process.env.STUDIO_ALLOW_PRIVATE !== 'true';

/** Private, loopback, link-local, carrier-grade NAT and unspecified addresses (IPv4, IPv6 and IPv4-mapped IPv6). */
function privateIp(ip) {
  if (net.isIPv6(ip)) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return privateIp(mapped[1]);
    return /^(::1?$|f[cd]|fe[89ab])/i.test(ip);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** A public address for host, or throws. Every address the name resolves to must be public. */
async function publicAddress(host, lookup = dns.lookup) {
  const name = String(host || '').replace(/^\[|\]$/g, '');
  if (!name) throw new Error('No host.');
  const addrs = net.isIP(name) ? [{ address: name }] : await lookup(name, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error(`Blocked: ${name}`);
  return preferV4(addrs).address;
}

// Workers have no IPv6 route; an IPv6-first answer would otherwise fail or hang.
const preferV4 = (addrs) => addrs.find((a) => net.isIPv4(a.address)) || addrs[0];
const CONNECT_TIMEOUT = 10000;

function splitHostPort(value, fallback) {
  const m = /^\[([^\]]+)\](?::(\d+))?$/.exec(value) || /^([^:]+)(?::(\d+))?$/.exec(value);
  return m ? { host: m[1], port: Number(m[2] || fallback) } : null;
}

/** Start the proxy on a free loopback port. Returns { url, close }. */
function startEgressProxy({ lookup } = {}) {
  const server = http.createServer(async (req, res) => {
    // Plain-HTTP requests arrive with an absolute URL.
    let target;
    try {
      target = new URL(req.url);
      if (target.protocol !== 'http:') throw new Error();
      const address = await publicAddress(target.hostname, lookup);
      const headers = { ...req.headers };
      delete headers['proxy-connection'];
      delete headers['proxy-authorization'];
      const up = http.request({ host: address, port: Number(target.port || 80), method: req.method, path: `${target.pathname}${target.search}`, headers, timeout: CONNECT_TIMEOUT }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      });
      up.on('timeout', () => up.destroy());
      up.on('error', () => res.destroy());
      req.pipe(up);
    } catch {
      res.writeHead(403).end();
    }
  });

  // HTTPS (and WebSockets over TLS) arrive as CONNECT host:port.
  server.on('connect', async (req, socket, head) => {
    socket.on('error', () => {});
    const hp = splitHostPort(req.url, 443);
    try {
      if (!hp) throw new Error();
      const address = await publicAddress(hp.host, lookup);
      const up = net.connect({ port: hp.port, host: address, timeout: CONNECT_TIMEOUT }, () => {
        up.setTimeout(0);
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head?.length) up.write(head);
        up.pipe(socket);
        socket.pipe(up);
      });
      up.on('timeout', () => up.destroy());
      up.on('error', () => socket.destroy());
      up.on('close', () => socket.destroy());
      socket.on('close', () => up.destroy());
    } catch {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

/** dns.lookup for http(s).request that refuses private addresses at connection time (no gap for DNS rebinding). */
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }).then((addrs) => {
    if (!addrs.length || (strict() && addrs.some((a) => privateIp(a.address)))) return callback(Object.assign(new Error(`Blocked: ${hostname}`), { code: 'EBLOCKED' }));
    const pick = preferV4(addrs);
    if (options?.all) return callback(null, [pick]);
    callback(null, pick.address, pick.family);
  }, callback);
}

/**
 * fetch() for files a page points at (stylesheets, fonts, logos): public addresses only, every redirect re-checked,
 * size-capped. Returns { ok, status, buffer, text() }.
 */
async function safeFetch(url, { headers = {}, maxBytes = 25 << 20, redirects = 5, timeout = 20000 } = {}) {
  let current = new URL(url);
  for (let hop = 0; hop <= redirects; hop += 1) {
    if (!/^https?:$/.test(current.protocol)) throw new Error(`Blocked: ${current.protocol}`);
    const literal = current.hostname.replace(/^\[|\]$/g, '');
    if (strict() && net.isIP(literal) && privateIp(literal)) throw new Error(`Blocked: ${literal}`);
    const res = await new Promise((resolve, reject) => {
      const req = (current.protocol === 'https:' ? https : http).get(current, { headers, lookup: guardedLookup, timeout }, resolve);
      req.on('timeout', () => req.destroy(new Error('Timed out')));
      req.on('error', reject);
    });
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      current = new URL(res.headers.location, current);
      continue;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of res) {
      size += chunk.length;
      if (size > maxBytes) {
        res.destroy();
        throw new Error('File too large');
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, buffer, text: () => buffer.toString('utf8') };
  }
  throw new Error('Too many redirects');
}

/** Chrome flags that send every request, loopback included, through the proxy and keep WebRTC from going around it. */
const proxyArgs = (url) => [`--proxy-server=${url}`, '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'];

module.exports = { privateIp, publicAddress, startEgressProxy, proxyArgs, safeFetch };
