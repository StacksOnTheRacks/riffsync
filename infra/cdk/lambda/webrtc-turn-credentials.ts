import { createHmac } from 'node:crypto';

/**
 * TURN REST-style password for coturn `use-auth-secret`:
 * base64( HMAC-SHA1( secret, username ) ) where username is `${expiryUnix}:${suffix}`.
 */
export function turnRestCredential(secret: string, username: string): string {
  return createHmac('sha1', secret).update(username, 'utf8').digest('base64');
}

export function turnRestUsername(expiryUnix: number, suffix: string): string {
  return `${expiryUnix}:${suffix}`;
}
