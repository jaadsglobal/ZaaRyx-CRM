const DEFAULT_LOCAL_API_PORT = '3000';
const API_PREFIX = '/api/';

let apiBridgeInstalled = false;
let preferredApiBase = '';

const normalizeBase = (base: string) => base.replace(/\/$/, '');

const isPrivateIpv4Host = (hostname: string) => {
  const segments = hostname.split('.').map((segment) => Number(segment));

  if (segments.length !== 4 || segments.some((segment) => Number.isNaN(segment))) {
    return false;
  }

  const [first, second] = segments;

  if (first === 10) {
    return true;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  return first === 192 && second === 168;
};

const isLikelyLocalHost = (hostname: string) =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '0.0.0.0' ||
  hostname === '[::1]' ||
  hostname.endsWith('.local') ||
  isPrivateIpv4Host(hostname);

const getConfiguredApiBase = () => {
  const configuredBase = import.meta.env.VITE_API_BASE_URL;

  if (typeof configuredBase !== 'string' || !configuredBase.trim()) {
    return null;
  }

  return normalizeBase(configuredBase.trim());
};

const getApiPort = () => {
  const configuredPort = import.meta.env.VITE_API_PORT;

  if (typeof configuredPort !== 'string' || !configuredPort.trim()) {
    return DEFAULT_LOCAL_API_PORT;
  }

  return configuredPort.trim();
};

const buildApiBaseCandidates = () => {
  const candidates: string[] = [];
  const seenCandidates = new Set<string>();

  const pushCandidate = (base: string) => {
    const normalizedBase = base ? normalizeBase(base) : '';

    if (seenCandidates.has(normalizedBase)) {
      return;
    }

    seenCandidates.add(normalizedBase);
    candidates.push(normalizedBase);
  };

  pushCandidate(preferredApiBase);
  pushCandidate('');

  const configuredBase = getConfiguredApiBase();

  if (configuredBase) {
    pushCandidate(configuredBase);
  }

  if (typeof window === 'undefined') {
    return candidates;
  }

  const apiPort = getApiPort();
  const { protocol, hostname, port } = window.location;

  if ((protocol === 'http:' || protocol === 'https:') && hostname && port !== apiPort) {
    pushCandidate(`${protocol}//${hostname}:${apiPort}`);
  }

  if (isLikelyLocalHost(hostname)) {
    pushCandidate(`http://localhost:${apiPort}`);
    pushCandidate(`http://127.0.0.1:${apiPort}`);
  }

  return candidates;
};

const buildApiUrl = (base: string, path: string) => (base ? `${base}${path}` : path);

const shouldHandleWithBridge = (input: unknown): input is string =>
  typeof input === 'string' && input.startsWith(API_PREFIX);

const fetchWithApiFallback = async (
  nativeFetch: typeof window.fetch,
  input: string,
  init?: RequestInit,
) => {
  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (const base of buildApiBaseCandidates()) {
    try {
      const response = await nativeFetch(buildApiUrl(base, input), {
        ...init,
        credentials: 'include',
      });

      if (response.status !== 404) {
        preferredApiBase = base;
        return response;
      }

      lastResponse = response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError ?? new TypeError('API unavailable');
};

export const installApiFetchBridge = () => {
  if (apiBridgeInstalled || typeof window === 'undefined') {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldHandleWithBridge(input)) {
      return nativeFetch(input, init);
    }

    return fetchWithApiFallback(nativeFetch, input, init);
  }) as typeof window.fetch;

  apiBridgeInstalled = true;
};
