// https://github.com/steel-dev/steel-cookbook/tree/main/examples/stripe-projects-web-agent

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

// Resolution happens here while the fetch runs in the remote Steel browser, so
// this guard is defense-in-depth rather than a remote-network SSRF boundary. A
// short success TTL limits how long this process reuses its own DNS verdict, but
// private-network restrictions still need enforcement where the browser connects.
const HOSTNAME_CHECK_TTL_MS = 30_000;

function normalizedHostname(hostname: string): string {
  return hostname
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function isBlockedHostname(hostname: string): boolean {
  return (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa")
  );
}

function ipv4ToNumber(address: string): number {
  return address
    .split(".")
    .map(Number)
    .reduce((value, octet) => value * 256 + octet, 0);
}

function inIpv4Range(address: number, base: string, prefix: number): boolean {
  const divisor = 2 ** (32 - prefix);
  return Math.floor(address / divisor) === Math.floor(ipv4ToNumber(base) / divisor);
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  const blockedRanges: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return !blockedRanges.some(([base, prefix]) =>
    inIpv4Range(value, base, prefix)
  );
}

function ipv6ToBigInt(address: string): bigint | null {
  let value = address.toLowerCase().split("%")[0];
  const embeddedIpv4 = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (embeddedIpv4) {
    if (isIP(embeddedIpv4) !== 4) return null;
    const ipv4 = ipv4ToNumber(embeddedIpv4);
    value = value.replace(
      embeddedIpv4,
      `${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`
    );
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = [...left, ...Array(missing).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }

  return parts.reduce((result, part) => (result << 16n) | BigInt(`0x${part}`), 0n);
}

function inIpv6Range(value: bigint, base: bigint, prefix: number): boolean {
  const shift = 128n - BigInt(prefix);
  return value >> shift === base >> shift;
}

function isPublicIpv6(address: string): boolean {
  const value = ipv6ToBigInt(address);
  if (value === null || value === 0n || value === 1n) return false;

  const mappedBase = ipv6ToBigInt("::ffff:0:0");
  if (mappedBase !== null && inIpv6Range(value, mappedBase, 96)) {
    const ipv4 = Number(value & 0xffffffffn);
    const addressText = [24, 16, 8, 0]
      .map((shift) => (ipv4 >>> shift) & 255)
      .join(".");
    return isPublicIpv4(addressText);
  }

  const ranges: Array<[string, number]> = [
    ["::", 96],
    ["100::", 64],
    ["fc00::", 7],
    ["fec0::", 10],
    ["fe80::", 10],
    ["ff00::", 8],
    ["2001:db8::", 32],
  ];
  if (
    ranges.some(([base, prefix]) => {
      const parsedBase = ipv6ToBigInt(base);
      return parsedBase !== null && inIpv6Range(value, parsedBase, prefix);
    })
  ) {
    return false;
  }

  const globalUnicastBase = ipv6ToBigInt("2000::");
  return (
    globalUnicastBase !== null && inIpv6Range(value, globalUnicastBase, 3)
  );
}

function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

export type PublicUrlGuard = {
  assert(url: string): Promise<URL>;
};

type DnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<Array<{ address: string; family: number }>>;

type PublicUrlGuardOptions = {
  lookupHostname?: DnsLookup;
  now?: () => number;
};

type HostnameCheck = {
  check: Promise<void>;
  validatedAt: number | null;
};

export function createPublicUrlGuard(
  options: PublicUrlGuardOptions = {}
): PublicUrlGuard {
  const lookupHostname: DnsLookup =
    options.lookupHostname ??
    ((hostname, lookupOptions) => lookup(hostname, lookupOptions));
  const now = options.now ?? (() => performance.now());
  const hostnameChecks = new Map<string, HostnameCheck>();

  async function checkHostname(hostname: string): Promise<void> {
    const host = normalizedHostname(hostname);
    if (!host || isBlockedHostname(host)) {
      throw new Error("Local and private network addresses are not allowed.");
    }

    const ipVersion = isIP(host);
    if (ipVersion !== 0) {
      if (!isPublicIp(host)) {
        throw new Error("Local and private network addresses are not allowed.");
      }
      return;
    }

    const cached = hostnameChecks.get(host);
    if (cached) {
      const pending = cached.validatedAt === null;
      const fresh =
        cached.validatedAt !== null &&
        now() - cached.validatedAt < HOSTNAME_CHECK_TTL_MS;
      if (pending || fresh) {
        await cached.check;
        return;
      }
      hostnameChecks.delete(host);
    }

    const check = (async () => {
      const results = await lookupHostname(host, { all: true, verbatim: true });
      if (results.length === 0 || results.some(({ address }) => !isPublicIp(address))) {
        throw new Error("The hostname resolves to a local or private address.");
      }
    })();
    const entry: HostnameCheck = { check, validatedAt: null };
    hostnameChecks.set(host, entry);
    try {
      await check;
      if (hostnameChecks.get(host) === entry) {
        entry.validatedAt = now();
      }
    } catch (error) {
      // Don't cache failures. Only remove this lookup's entry so an older
      // completion can never delete a newer verdict.
      if (hostnameChecks.get(host) === entry) {
        hostnameChecks.delete(host);
      }
      throw error;
    }
  }

  return {
    async assert(rawUrl: string): Promise<URL> {
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        throw new Error("Enter a complete http:// or https:// URL.");
      }

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Only http:// and https:// URLs are allowed.");
      }
      if (url.username || url.password) {
        throw new Error("URLs containing credentials are not allowed.");
      }

      await checkHostname(url.hostname);
      return url;
    },
  };
}
