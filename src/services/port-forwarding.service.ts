import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { v4 as uuidv4 } from 'uuid';
import type { PortForwarding } from '../shared/index.js';
import { isValidContainerId } from './devcontainer.service.js';

const execFileAsync = promisify(execFile);

/**
 * Error thrown when port forwarding operations fail.
 */
export class PortForwardingError extends Error {
  constructor(
    public readonly operation: string,
    public readonly details: string
  ) {
    super(`Port forwarding ${operation} failed: ${details}`);
    this.name = 'PortForwardingError';
  }
}

/**
 * Error thrown when the port is already in use.
 */
export class PortInUseError extends Error {
  constructor(public readonly port: number) {
    super(`Port ${port} is already in use`);
    this.name = 'PortInUseError';
  }
}

/**
 * Error thrown when port forwarding is not found.
 */
export class PortForwardingNotFoundError extends Error {
  constructor(public readonly portId: string) {
    super(`Port forwarding not found: ${portId}`);
    this.name = 'PortForwardingNotFoundError';
  }
}

interface ActiveConnection {
  clientSocket: net.Socket;
  containerSocket: net.Socket;
}

interface ActiveForwarding {
  config: PortForwarding;
  server: net.Server;
  containerId: string;
  containerIp: string;
  activeConnections: Set<ActiveConnection>;
}

/**
 * Gets the IP address of a Docker container.
 */
async function getContainerIp(containerId: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect',
      '--format',
      '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
      containerId,
    ]);

    const ip = stdout.trim();
    if (!ip) {
      throw new PortForwardingError('start', `Container ${containerId} has no IP address`);
    }

    return ip;
  } catch (error) {
    if (error instanceof PortForwardingError) {
      throw error;
    }
    throw new PortForwardingError('start', `Failed to get container IP: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Manages port forwarding from host to container using TCP proxy.
 */
export class PortForwardingManager {
  /**
   * Map of sessionId -> Map of portId -> ActiveForwarding
   */
  private forwardings = new Map<string, Map<string, ActiveForwarding>>();

  /**
   * Starts a new port forwarding.
   *
   * @param sessionId - Session ID
   * @param containerId - Docker container ID
   * @param hostPort - Host port to listen on
   * @param containerPort - Container port to forward to
   * @param label - Optional label for the forwarding
   * @returns Port forwarding configuration
   */
  async start(
    sessionId: string,
    containerId: string,
    hostPort: number,
    containerPort: number,
    label?: string
  ): Promise<PortForwarding> {
    if (!isValidContainerId(containerId)) {
      throw new PortForwardingError('start', `Invalid container ID: ${containerId}`);
    }

    // Validate port numbers
    if (hostPort < 1 || hostPort > 65535) {
      throw new PortForwardingError('start', `Invalid host port: ${hostPort}`);
    }
    if (containerPort < 1 || containerPort > 65535) {
      throw new PortForwardingError('start', `Invalid container port: ${containerPort}`);
    }

    // Check if this session already has a forwarding on this host port
    const sessionForwardings = this.forwardings.get(sessionId);
    if (sessionForwardings) {
      for (const forwarding of sessionForwardings.values()) {
        if (forwarding.config.hostPort === hostPort) {
          throw new PortForwardingError('start', `Host port ${hostPort} is already forwarded in this session`);
        }
      }
    }

    // Get container IP address
    const containerIp = await getContainerIp(containerId);

    const portId = uuidv4();
    const config: PortForwarding = {
      id: portId,
      hostPort,
      containerPort,
      label,
    };

    const activeConnections = new Set<ActiveConnection>();

    // Create TCP server
    const server = net.createServer((clientSocket) => {
      // Connect directly to container IP
      const containerSocket = net.createConnection({
        host: containerIp,
        port: containerPort,
      });

      const conn: ActiveConnection = { clientSocket, containerSocket };
      activeConnections.add(conn);

      // Pipe data bidirectionally
      clientSocket.pipe(containerSocket);
      containerSocket.pipe(clientSocket);

      // Error handling
      const cleanup = () => {
        activeConnections.delete(conn);
        if (!clientSocket.destroyed) {
          clientSocket.destroy();
        }
        if (!containerSocket.destroyed) {
          containerSocket.destroy();
        }
      };

      clientSocket.on('error', cleanup);
      clientSocket.on('close', cleanup);
      containerSocket.on('error', (err) => {
        console.error(`[PortForwarding] Container connection error for ${hostPort}:${containerPort}: ${err.message}`);
        cleanup();
      });
      containerSocket.on('close', cleanup);
    });

    // Handle server errors after startup (startup errors are handled in the Promise below)
    server.on('error', (err: NodeJS.ErrnoException) => {
      // Don't throw - just log and cleanup. Throwing from event handler crashes the process.
      console.error(`[PortForwarding] Server error on port ${hostPort}:`, err.message);
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new PortInUseError(hostPort));
        } else {
          reject(new PortForwardingError('start', err.message));
        }
      });

      server.listen(hostPort, '0.0.0.0', () => {
        console.log(`[PortForwarding] Started forwarding ${hostPort} -> ${containerIp}:${containerPort} for session ${sessionId}`);
        resolve();
      });
    });

    // Store the forwarding
    if (!this.forwardings.has(sessionId)) {
      this.forwardings.set(sessionId, new Map());
    }
    this.forwardings.get(sessionId)!.set(portId, {
      config,
      server,
      containerId,
      containerIp,
      activeConnections,
    });

    return config;
  }

  /**
   * Stops a port forwarding.
   *
   * @param sessionId - Session ID
   * @param portId - Port forwarding ID
   */
  stop(sessionId: string, portId: string): void {
    const sessionForwardings = this.forwardings.get(sessionId);
    if (!sessionForwardings) {
      throw new PortForwardingNotFoundError(portId);
    }

    const forwarding = sessionForwardings.get(portId);
    if (!forwarding) {
      throw new PortForwardingNotFoundError(portId);
    }

    // Close all active connections
    for (const conn of forwarding.activeConnections) {
      if (!conn.clientSocket.destroyed) {
        conn.clientSocket.destroy();
      }
      if (!conn.containerSocket.destroyed) {
        conn.containerSocket.destroy();
      }
    }
    forwarding.activeConnections.clear();

    // Close the server
    forwarding.server.close();

    console.log(`[PortForwarding] Stopped forwarding ${forwarding.config.hostPort} -> ${forwarding.containerIp}:${forwarding.config.containerPort} for session ${sessionId}`);

    // Remove from map
    sessionForwardings.delete(portId);
    if (sessionForwardings.size === 0) {
      this.forwardings.delete(sessionId);
    }
  }

  /**
   * Stops all port forwardings for a session.
   *
   * @param sessionId - Session ID
   */
  stopAll(sessionId: string): void {
    const sessionForwardings = this.forwardings.get(sessionId);
    if (!sessionForwardings) {
      return;
    }

    for (const portId of sessionForwardings.keys()) {
      try {
        this.stop(sessionId, portId);
      } catch (error) {
        console.error(`[PortForwarding] Error stopping port ${portId}:`, error);
      }
    }
  }

  /**
   * Lists all port forwardings for a session.
   *
   * @param sessionId - Session ID
   * @returns Array of port forwarding configurations
   */
  list(sessionId: string): PortForwarding[] {
    const sessionForwardings = this.forwardings.get(sessionId);
    if (!sessionForwardings) {
      return [];
    }

    return Array.from(sessionForwardings.values()).map((f) => f.config);
  }

  /**
   * Gets a port forwarding by ID.
   *
   * @param sessionId - Session ID
   * @param portId - Port forwarding ID
   * @returns Port forwarding configuration
   */
  get(sessionId: string, portId: string): PortForwarding | undefined {
    const sessionForwardings = this.forwardings.get(sessionId);
    if (!sessionForwardings) {
      return undefined;
    }

    return sessionForwardings.get(portId)?.config;
  }
}

// Singleton instance
let portForwardingManager: PortForwardingManager | null = null;

/**
 * Gets the singleton PortForwardingManager instance.
 */
export function getPortForwardingManager(): PortForwardingManager {
  if (!portForwardingManager) {
    portForwardingManager = new PortForwardingManager();
  }
  return portForwardingManager;
}

/**
 * Resets the singleton PortForwardingManager instance (for testing).
 */
export function resetPortForwardingManager(): void {
  if (portForwardingManager) {
    // Stop all forwardings
    for (const sessionId of portForwardingManager['forwardings'].keys()) {
      portForwardingManager.stopAll(sessionId);
    }
  }
  portForwardingManager = null;
}
