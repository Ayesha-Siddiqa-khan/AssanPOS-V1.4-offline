import type { NetworkState } from 'expo-network';

type TcpSocketModule = {
  createConnection: (
    options: { host: string; port: number; timeout?: number },
    connectionListener?: () => void
  ) => any;
};

export type NetworkDiagnostics = {
  ipAddress?: string;
  networkType?: string;
  isConnected?: boolean;
  isInternetReachable?: boolean;
  isWifi?: boolean;
  isCellular?: boolean;
  isVpn?: boolean;
  warnings: string[];
};

export type DiscoveryResult = {
  ip: string;
  port: number;
  responseTimeMs: number;
};

const loadTcpSocket = (): TcpSocketModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-tcp-socket');
  } catch (error) {
    return null;
  }
};

const loadNetworkModule = async (): Promise<typeof import('expo-network') | null> => {
  try {
    return await import('expo-network');
  } catch (error) {
    return null;
  }
};

export async function getNetworkDiagnostics(): Promise<NetworkDiagnostics> {
  const warnings: string[] = [];
  const network = await loadNetworkModule();
  if (!network) {
    return { warnings: ['Network diagnostics unavailable in this build.'] };
  }

  let state: NetworkState | null = null;
  let ipAddress: string | undefined;

  try {
    state = await network.getNetworkStateAsync();
  } catch (error) {
    warnings.push('Unable to read network state.');
  }

  try {
    ipAddress = await network.getIpAddressAsync();
  } catch (error) {
    warnings.push('Unable to read local IP address.');
  }

  const type = state?.type ? String(state.type) : undefined;
  const isWifi = state?.type === network.NetworkStateType.WIFI;
  const isCellular = state?.type === network.NetworkStateType.CELLULAR;
  const isVpn = Boolean((state as any)?.isVpn);

  if (isCellular) {
    warnings.push('Mobile data detected. Connect to Wi-Fi for LAN printing.');
  }
  if (isVpn) {
    warnings.push('VPN detected. Disable VPN to reach LAN printers.');
  }
  if (state && !state.isConnected) {
    warnings.push('Device appears offline. Printing will fail.');
  }

  return {
    ipAddress,
    networkType: type,
    isConnected: state?.isConnected,
    isInternetReachable: state?.isInternetReachable ?? undefined,
    isWifi,
    isCellular,
    isVpn,
    warnings,
  };
}

const probeTcpPort = async (
  ip: string,
  port: number,
  timeoutMs: number
): Promise<{ ok: boolean; responseTimeMs: number }> => {
  const TcpSocket = loadTcpSocket();
  if (!TcpSocket) {
    return { ok: false, responseTimeMs: 0 };
  }

  const start = Date.now();
  return new Promise((resolve) => {
    let resolved = false;
    const socket = TcpSocket.createConnection({ host: ip, port, timeout: timeoutMs }, () => {
      const responseTimeMs = Date.now() - start;
      socket.end();
      if (!resolved) {
        resolved = true;
        resolve({ ok: true, responseTimeMs });
      }
    });

    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve({ ok, responseTimeMs: Date.now() - start });
    };

    socket.on('timeout', () => {
      socket.destroy();
      finish(false);
    });
    socket.on('error', () => {
      finish(false);
    });
    socket.on('close', () => {
      finish(false);
    });
  });
};

export async function scanJetDirectPrinters(options?: {
  subnet?: string;
  port?: number;
  timeoutMs?: number;
  concurrency?: number;
  onProgress?: (progress: { scanned: number; total: number; found: number }) => void;
}): Promise<DiscoveryResult[]> {
  const network = await loadNetworkModule();
  let subnet = options?.subnet;
  if (!subnet && network) {
    try {
      const ip = await network.getIpAddressAsync();
      if (ip && ip.includes('.')) {
        subnet = ip.split('.').slice(0, 3).join('.');
      }
    } catch (error) {
      // ignore
    }
  }

  if (!subnet) {
    return [];
  }

  const port = options?.port ?? 9100;
  const timeoutMs = options?.timeoutMs ?? 450;
  const concurrency = options?.concurrency ?? 30;
  const hosts = Array.from({ length: 254 }, (_, index) => `${subnet}.${index + 1}`);

  let scanned = 0;
  let found = 0;
  let cursor = 0;
  const results: DiscoveryResult[] = [];

  const worker = async () => {
    while (cursor < hosts.length) {
      const current = cursor;
      cursor += 1;
      const host = hosts[current];
      const probe = await probeTcpPort(host, port, timeoutMs);
      scanned += 1;
      if (probe.ok) {
        found += 1;
        results.push({ ip: host, port, responseTimeMs: probe.responseTimeMs });
      }
      options?.onProgress?.({ scanned, total: hosts.length, found });
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results.sort((a, b) => a.responseTimeMs - b.responseTimeMs);
}
