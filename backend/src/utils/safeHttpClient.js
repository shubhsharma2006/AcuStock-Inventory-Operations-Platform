/**
 * SafeHttpClient — SSRF & DNS Rebinding Protection Engine
 * ─────────────────────────────────────────────────────────────
 * Validates outgoing URLs and pin-resolves IP addresses before
 * connecting. Strictly blocks loopback, private subnets, cloud metadata
 * endpoints (e.g. AWS/GCP 169.254.169.254), and link-local ranges.
 */

'use strict';

const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const { URL } = require('url');

// IPv4 CIDR blocks to block
const BLOCKED_IPV4_RANGES = [
  { start: ipToLong('0.0.0.0'), end: ipToLong('0.255.255.255') },       // Current network
  { start: ipToLong('10.0.0.0'), end: ipToLong('10.255.255.255') },     // RFC1918 Private
  { start: ipToLong('100.64.0.0'), end: ipToLong('100.127.255.255') }, // Shared / CGNAT
  { start: ipToLong('127.0.0.0'), end: ipToLong('127.255.255.255') },   // Loopback
  { start: ipToLong('169.254.0.0'), end: ipToLong('169.254.255.255') }, // Link-local / Cloud Metadata (169.254.169.254)
  { start: ipToLong('172.16.0.0'), end: ipToLong('172.31.255.255') },   // RFC1918 Private
  { start: ipToLong('192.0.0.0'), end: ipToLong('192.0.0.255') },       // IETF Protocol
  { start: ipToLong('192.168.0.0'), end: ipToLong('192.168.255.255') }, // RFC1918 Private
  { start: ipToLong('198.18.0.0'), end: ipToLong('198.19.255.255') },   // Benchmark
  { start: ipToLong('224.0.0.0'), end: ipToLong('239.255.255.255') },   // Multicast
  { start: ipToLong('240.0.0.0'), end: ipToLong('255.255.255.255') }    // Reserved / Broadcast
];

function ipToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateOrReservedIPv4(ip) {
  const longIp = ipToLong(ip);
  return BLOCKED_IPV4_RANGES.some(range => longIp >= range.start && longIp <= range.end);
}

function isPrivateOrReservedIPv6(ip) {
  const normalized = ip.toLowerCase();
  // Loopback, unspecified, IPv4-mapped, link-local, unique local
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.replace('::ffff:', '');
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipv4Part)) {
      return isPrivateOrReservedIPv4(ipv4Part);
    }
    return true;
  }
  return false;
}

function isIpBlocked(ip) {
  if (process.env.ALLOW_PRIVATE_NETWORK_WEBHOOKS === 'true') {
    return false;
  }
  if (ip.includes(':')) {
    return isPrivateOrReservedIPv6(ip);
  }
  return isPrivateOrReservedIPv4(ip);
}

/**
 * Validates a hostname or IP string against SSRF blacklists.
 * @param {string} hostname
 * @returns {Promise<string[]>} Array of resolved and verified IP addresses
 */
async function validateAndResolveHost(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    throw new Error('SSRF_DETECTED: Invalid hostname');
  }

  const cleanHost = hostname.trim().replace(/^\[|\]$/g, '');

  // Directly check if hostname is already a raw IP
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanHost) || cleanHost.includes(':')) {
    if (isIpBlocked(cleanHost)) {
      throw new Error(`SSRF_DETECTED: Access to restricted IP address (${cleanHost}) is forbidden`);
    }
    return [cleanHost];
  }

  // Check known dangerous hostnames
  if (cleanHost === 'localhost' || cleanHost.endsWith('.localhost') || cleanHost.endsWith('.local')) {
    if (process.env.ALLOW_PRIVATE_NETWORK_WEBHOOKS !== 'true') {
      throw new Error(`SSRF_DETECTED: Access to local domain (${cleanHost}) is forbidden`);
    }
  }

  // Pre-flight DNS resolution
  let addresses;
  try {
    addresses = await dns.lookup(cleanHost, { all: true });
  } catch (dnsErr) {
    throw new Error(`DNS_RESOLUTION_FAILED: Unable to resolve hostname "${cleanHost}": ${dnsErr.message}`);
  }

  if (!addresses || addresses.length === 0) {
    throw new Error(`DNS_RESOLUTION_FAILED: No DNS records for host "${cleanHost}"`);
  }

  for (const addr of addresses) {
    if (isIpBlocked(addr.address)) {
      throw new Error(`SSRF_DETECTED: Host "${cleanHost}" resolved to restricted IP (${addr.address})`);
    }
  }

  return addresses.map(a => a.address);
}

/**
 * Executes an HTTP/HTTPS request with strict SSRF & DNS rebinding protections.
 * Pins connection directly to the pre-verified IP and passes original hostname in Host header.
 *
 * @param {string|URL} targetUrl
 * @param {Object} options - Standard fetch/request options (method, headers, body, timeoutMs, maxRedirects)
 * @returns {Promise<{ status: number, statusText: string, headers: Object, data: string, json: Function }>}
 */
async function safeRequest(targetUrl, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = 10000,
    maxRedirects = 3
  } = options;

  let currentUrl = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;

  if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
    throw new Error(`SSRF_DETECTED: Unsupported protocol "${currentUrl.protocol}". Only HTTP and HTTPS are permitted.`);
  }

  // Validate and resolve target IP
  const resolvedIps = await validateAndResolveHost(currentUrl.hostname);
  const targetIp = resolvedIps[0];

  return new Promise((resolve, reject) => {
    const isHttps = currentUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const port = currentUrl.port || (isHttps ? 443 : 80);
    const hostHeader = currentUrl.port ? `${currentUrl.hostname}:${currentUrl.port}` : currentUrl.hostname;

    const requestHeaders = {
      ...headers,
      Host: hostHeader,
      'User-Agent': headers['User-Agent'] || 'AcuStock-SafeHttpClient/1.0'
    };

    const reqOptions = {
      host: targetIp, // Connect directly to verified IP (anti-DNS-rebinding)
      port,
      path: currentUrl.pathname + currentUrl.search,
      method: method.toUpperCase(),
      headers: requestHeaders,
      timeout: timeoutMs,
      // For HTTPS, SNI servername must match the original hostname for valid TLS handshake
      ...(isHttps && { servername: currentUrl.hostname })
    };

    const req = client.request(reqOptions, (res) => {
      // Handle HTTP redirects safely (re-verifying destination)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) {
          return reject(new Error('SSRF_DETECTED: Maximum redirect depth exceeded'));
        }
        res.resume(); // Discard redirect body
        const nextUrl = new URL(res.headers.location, currentUrl.href);
        return resolve(safeRequest(nextUrl, { ...options, maxRedirects: maxRedirects - 1 }));
      }

      let responseData = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        responseData += chunk;
        // Limit response size to 10MB to prevent decompression/memory exhaustion bombs
        if (responseData.length > 10 * 1024 * 1024) {
          req.destroy(new Error('RESPONSE_TOO_LARGE: Response exceeded 10MB limit'));
        }
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          data: responseData,
          json: () => {
            try {
              return JSON.parse(responseData);
            } catch (jsonErr) {
              throw new Error(`INVALID_JSON_RESPONSE: ${jsonErr.message}`);
            }
          }
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`REQUEST_TIMEOUT: Outbound request timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }

    req.end();
  });
}

module.exports = {
  safeRequest,
  validateAndResolveHost,
  isIpBlocked,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6
};

