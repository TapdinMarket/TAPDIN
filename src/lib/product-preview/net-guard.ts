// Address checks used before any outbound connection. Pure; shared by the fetcher and its tests.

function ipv4ToInt(ip: string) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function publicV4(ip: string) {
  const value = ipv4ToInt(ip);
  if (value === null) return false;
  return !V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((value & mask) >>> 0) === ((ipv4ToInt(base)! & mask) >>> 0);
  });
}

/** True only for globally routable unicast addresses. Loopback, private, link-local, CGNAT, multicast,
 *  documentation ranges, IPv4-mapped private addresses and unique-local IPv6 are all rejected. */
export function isPublicAddress(address: string): boolean {
  const ip = address.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return publicV4(ip);
  if (!ip.includes(':')) return false;
  const mapped = ip.match(/^(?:0{0,4}:){0,5}(?:0{0,4}:)?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? ip.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return publicV4(mapped[1]);
  if (ip === '::' || ip === '::1') return false;
  const first = parseInt(ip.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (ip.startsWith('64:ff9b:') || ip.startsWith('2001:db8:') || ip.startsWith('2002:')) return false; // NAT64, docs, 6to4
  return (first & 0xe000) === 0x2000; // only 2000::/3 is global unicast
}
