import type { SessionState } from '@ccsandbox/shared';
import { getSessionStore } from '../persistence/session-store.js';
import { isContainerRunning } from './devcontainer.service.js';

/** Health check interval: 15 seconds */
const HEALTH_CHECK_INTERVAL_MS = 15 * 1000;

/** Background health check timer */
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Determines the expected session state based on container running status.
 */
function getExpectedState(isRunning: boolean): SessionState {
  return isRunning ? 'RUNNING' : 'STOPPED';
}

/**
 * Checks container health for all sessions and updates state if needed.
 * This function is called periodically by the health check timer.
 */
async function checkContainerHealth(): Promise<void> {
  const sessionStore = getSessionStore();
  const sessions = await sessionStore.list();

  for (const session of sessions) {
    // Skip sessions without containerId
    if (!session.containerId) {
      continue;
    }

    // Skip sessions in ERROR state
    if (session.state === 'ERROR') {
      continue;
    }

    try {
      const running = await isContainerRunning(session.containerId);
      const expectedState = getExpectedState(running);

      // Update state if there's a mismatch
      if (session.state !== expectedState) {
        console.log(
          `[container-health] Session ${session.sessionId} state mismatch: ` +
          `current=${session.state}, container running=${running}, updating to ${expectedState}`
        );
        await sessionStore.update(session.sessionId, { state: expectedState });
      }
    } catch (error) {
      // Log but don't fail the entire health check for one container error
      console.error(
        `[container-health] Failed to check container ${session.containerId} for session ${session.sessionId}:`,
        error
      );
    }
  }
}

/**
 * Starts the background container health check.
 * Checks all sessions' container status every 15 seconds.
 */
export function startContainerHealthCheck(): void {
  // Clear existing timer if any
  stopContainerHealthCheck();

  // Run initial check immediately
  checkContainerHealth().catch((err) => {
    console.error('[container-health] Initial health check failed:', err);
  });

  // Set up periodic health check
  healthCheckTimer = setInterval(() => {
    checkContainerHealth().catch((err) => {
      console.error('[container-health] Health check failed:', err);
    });
  }, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Stops the background container health check.
 */
export function stopContainerHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
    console.log('[container-health] Stopped container health check');
  }
}

/**
 * Returns whether the health check is currently running.
 * Primarily used for testing.
 */
export function isHealthCheckRunning(): boolean {
  return healthCheckTimer !== null;
}

/**
 * Manually trigger a health check (for testing purposes).
 */
export async function runHealthCheckOnce(): Promise<void> {
  await checkContainerHealth();
}
