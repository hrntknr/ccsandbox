import {
  execInDevcontainer,
  type DevcontainerExecOptions,
} from './devcontainer.service.js';
import type { DetectedPort } from '../shared/index.js';

/**
 * Parses /proc/net/tcp or /proc/net/tcp6 content to extract listening ports.
 *
 * Format:
 *   sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
 *    0: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12345
 *
 * - local_address: hex_ip:hex_port (e.g., 0BB8 = 3000)
 * - st: state (0A = LISTEN)
 * - inode: socket inode number
 *
 * @param content - Content of /proc/net/tcp or /proc/net/tcp6
 * @returns Array of { port, inode }
 */
export function parseProcNetTcp(
  content: string
): Array<{ port: number; inode: number }> {
  const result: Array<{ port: number; inode: number }> = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('sl')) {
      // Skip header line
      continue;
    }

    const fields = trimmed.split(/\s+/);
    if (fields.length < 10) {
      continue;
    }

    // fields[1] = local_address (e.g., "00000000:0BB8")
    // fields[3] = state (0A = LISTEN)
    // fields[9] = inode
    const localAddress = fields[1];
    const state = fields[3];
    const inodeStr = fields[9];

    // Only interested in LISTEN state (0A)
    if (state !== '0A') {
      continue;
    }

    // Parse port from local_address
    if (!localAddress) {
      continue;
    }
    const colonIndex = localAddress.lastIndexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const portHex = localAddress.slice(colonIndex + 1);
    const port = parseInt(portHex ?? '', 16);
    const inode = parseInt(inodeStr ?? '', 10);

    if (!isNaN(port) && !isNaN(inode) && port > 0 && inode > 0) {
      result.push({ port, inode });
    }
  }

  return result;
}

/**
 * Parses the output of 'ls -l /proc/[pid]/fd/[fd]' to map inodes to PIDs.
 *
 * Example line:
 *   lrwx------ 1 user user 64 Jan 1 00:00 /proc/123/fd/4 -> socket:[12345]
 *
 * @param content - Output of ls -l listing
 * @returns Map of inode -> PID
 */
export function parseProcFdListing(content: string): Map<number, number> {
  const inodeToPid = new Map<number, number>();
  const lines = content.split('\n');

  // Match pattern: /proc/<pid>/fd/<fd> -> socket:[<inode>]
  const regex = /\/proc\/(\d+)\/fd\/\d+\s+->\s+socket:\[(\d+)\]/;

  for (const line of lines) {
    const match = regex.exec(line);
    if (match) {
      const pid = parseInt(match[1] ?? '', 10);
      const inode = parseInt(match[2] ?? '', 10);
      if (!isNaN(pid) && !isNaN(inode)) {
        inodeToPid.set(inode, pid);
      }
    }
  }

  return inodeToPid;
}

/**
 * Parses the output of process name lookup.
 *
 * Expected format: "pid:name" per line
 *
 * @param content - Output with pid:name pairs
 * @returns Map of PID -> process name
 */
export function parseProcessNames(content: string): Map<number, string> {
  const pidToName = new Map<number, string>();
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const pid = parseInt(trimmed.slice(0, colonIndex), 10);
    const name = trimmed.slice(colonIndex + 1).trim();

    if (!isNaN(pid) && name) {
      pidToName.set(pid, name);
    }
  }

  return pidToName;
}

/**
 * Detects listening ports in a container by parsing /proc/net/tcp{,6}.
 *
 * @param options - Execution options for devcontainer
 * @returns Array of detected ports with process information
 */
export async function detectPorts(
  options: DevcontainerExecOptions
): Promise<DetectedPort[]> {
  try {
    // Step 1: Read /proc/net/tcp and /proc/net/tcp6
    const [tcpResult, tcp6Result] = await Promise.all([
      execInDevcontainer(['cat', '/proc/net/tcp'], options),
      execInDevcontainer(['cat', '/proc/net/tcp6'], options),
    ]);

    // Parse listening ports
    const tcpPorts = tcpResult.exitCode === 0 ? parseProcNetTcp(tcpResult.stdout) : [];
    const tcp6Ports = tcp6Result.exitCode === 0 ? parseProcNetTcp(tcp6Result.stdout) : [];

    // Combine and deduplicate by port (prefer tcp over tcp6 if same port)
    const portMap = new Map<number, { port: number; inode: number; protocol: 'tcp' | 'tcp6' }>();
    for (const p of tcpPorts) {
      portMap.set(p.port, { ...p, protocol: 'tcp' });
    }
    for (const p of tcp6Ports) {
      if (!portMap.has(p.port)) {
        portMap.set(p.port, { ...p, protocol: 'tcp6' });
      }
    }

    if (portMap.size === 0) {
      return [];
    }

    // Step 2: Get inode to PID mapping
    // Use find with -exec readlink to get socket inodes
    const fdResult = await execInDevcontainer(
      ['sh', '-c', 'find /proc -maxdepth 4 -path "/proc/[0-9]*/fd/*" -exec ls -l {} \\; 2>/dev/null || true'],
      options
    );

    const inodeToPid = fdResult.exitCode === 0 ? parseProcFdListing(fdResult.stdout) : new Map<number, number>();

    // Step 3: Get process names for relevant PIDs
    const relevantPids = new Set<number>();
    for (const { inode } of portMap.values()) {
      const pid = inodeToPid.get(inode);
      if (pid) {
        relevantPids.add(pid);
      }
    }

    const pidToName = new Map<number, string>();
    if (relevantPids.size > 0) {
      // Read all comm files in one command
      const pids = Array.from(relevantPids);
      const commResult = await execInDevcontainer(
        ['sh', '-c', pids.map(pid => `echo "${pid}:$(cat /proc/${pid}/comm 2>/dev/null || echo unknown)"`).join('; ')],
        options
      );

      if (commResult.exitCode === 0) {
        const parsedNames = parseProcessNames(commResult.stdout);
        for (const [pid, name] of parsedNames) {
          pidToName.set(pid, name);
        }
      }
    }

    // Step 4: Build result
    const detectedPorts: DetectedPort[] = [];
    for (const [port, { inode, protocol }] of portMap) {
      const pid = inodeToPid.get(inode);
      const processName = pid ? (pidToName.get(pid) ?? 'unknown') : 'unknown';

      detectedPorts.push({
        port,
        protocol,
        processName,
        pid,
      });
    }

    // Sort by port number
    detectedPorts.sort((a, b) => a.port - b.port);

    return detectedPorts;
  } catch {
    // Detection failed - return empty array (not an error for suggestions)
    return [];
  }
}
