import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getConfig, hasConfig } from '../config.js';
import { verifyToken, verifyPassword } from '../utils/auth.js';

const AUTH_COOKIE_NAME = 'ccsandbox_auth';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Parse cookies from a raw cookie string.
 */
function parseCookies(cookieStr: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieStr) return cookies;

  for (const cookie of cookieStr.split(';')) {
    const [key, ...valueParts] = cookie.trim().split('=');
    if (key) {
      cookies[key] = valueParts.join('=');
    }
  }
  return cookies;
}

/**
 * Set the authentication cookie.
 */
function setAuthCookie(res: Response, token: string, isSecure: boolean): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

/**
 * Get the base URL for redirect (without query parameters).
 */
function getRedirectUrl(req: Request): string {
  return req.path;
}

/**
 * Verify credentials (token or password).
 * Returns true if authentication is successful.
 */
async function verifyCredentials(
  credential: string,
  authToken: string | undefined,
  authPasswordHash: string | undefined,
): Promise<boolean> {
  // Try token authentication first
  if (authToken && verifyToken(credential, authToken)) {
    return true;
  }

  // Try password authentication
  if (authPasswordHash) {
    try {
      const isValid = await verifyPassword(credential, authPasswordHash);
      if (isValid) {
        return true;
      }
    } catch {
      // Invalid password format, continue
    }
  }

  return false;
}

/**
 * Express middleware for authentication.
 * Checks query parameter, then cookie for authentication.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // If config is not initialized or no authentication is configured, skip
  if (!hasConfig()) {
    next();
    return;
  }

  const config = getConfig();
  const { authToken, authPasswordHash } = config;

  // If no authentication token is configured, skip
  if (!authToken) {
    next();
    return;
  }

  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const tokenParam = req.query['token'] as string | undefined;

  // Check query parameter token
  if (tokenParam) {
    const isValid = await verifyCredentials(
      tokenParam,
      authToken,
      authPasswordHash,
    );
    if (isValid) {
      // Set cookie and redirect to remove token from URL
      setAuthCookie(res, authToken, isSecure);
      res.redirect(302, getRedirectUrl(req));
      return;
    }
  }

  // Check cookie
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
  if (cookieToken) {
    const isValid = await verifyCredentials(
      cookieToken,
      authToken,
      authPasswordHash,
    );
    if (isValid) {
      next();
      return;
    }
  }

  // Authentication failed
  const isApiRequest =
    req.path.startsWith('/api') ||
    req.headers['accept']?.includes('application/json');

  if (isApiRequest) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  } else {
    res.status(401).send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authentication Required - ccsandbox</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #0d1117;
      color: #c9d1d9;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 400px;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    p {
      margin-bottom: 1.5rem;
      color: #8b949e;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    input {
      padding: 0.75rem 1rem;
      border: 1px solid #30363d;
      border-radius: 6px;
      background: #161b22;
      color: #c9d1d9;
      font-size: 1rem;
    }
    input:focus {
      outline: none;
      border-color: #58a6ff;
    }
    button {
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 6px;
      background: #238636;
      color: white;
      font-size: 1rem;
      cursor: pointer;
    }
    button:hover {
      background: #2ea043;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authentication Required</h1>
    <p>Enter your token or password to access ccsandbox.</p>
    <form method="GET" action="${req.path}">
      <input type="password" name="token" placeholder="Token or Password" required autofocus>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>
    `);
  }
}

/**
 * Verify WebSocket authentication from request.
 * Returns true if the request is authenticated.
 */
export async function verifyWebSocketAuth(
  req: IncomingMessage,
): Promise<boolean> {
  // If config is not initialized, allow
  if (!hasConfig()) {
    return true;
  }

  const config = getConfig();
  const { authToken, authPasswordHash } = config;

  // If no authentication is configured, allow
  if (!authToken) {
    return true;
  }

  // Parse cookies from request
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[AUTH_COOKIE_NAME];

  if (!cookieToken) {
    return false;
  }

  return verifyCredentials(cookieToken, authToken, authPasswordHash);
}

/**
 * Send 401 response for WebSocket upgrade request.
 */
export function sendWebSocketUnauthorized(
  socket: import('node:stream').Duplex,
): void {
  socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
  socket.destroy();
}
