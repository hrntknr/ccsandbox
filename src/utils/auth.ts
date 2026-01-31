import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Generate a random authentication token.
 * Returns 16 characters of URL-safe base64 (12 bytes).
 */
export function generateAuthToken(): string {
  return crypto.randomBytes(12).toString('base64url');
}

/**
 * Hash a password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Verify a token using timing-safe comparison.
 * Prevents timing attacks by ensuring constant-time comparison.
 */
export function verifyToken(provided: string, stored: string): boolean {
  if (!provided || !stored || provided.length !== stored.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(stored));
}
