import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

/** `promisify(scrypt)` drops the options overload, so wrap it by hand. */
function scryptAsync(
  secret: string,
  salt: Buffer,
  keylen: number,
  cost: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, keylen, { N: cost }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/**
 * scrypt cost. N=16384 keeps a check around ~50ms on a Raspberry Pi 3, which
 * is slow enough to make the 10^4–10^8 PIN space painful to grind and fast
 * enough that unlocking a profile still feels instant.
 */
const N = 16_384;
const KEYLEN = 32;
const SALT_BYTES = 16;

/**
 * Profile PINs and the administrator password are stored as
 * `scrypt$<N>$<salt>$<hash>`, never in the clear. A home server's data volume
 * is easy to read off an SD card, and people reuse short numeric secrets — a
 * plain `users.json` would hand over every profile's PIN.
 */
export async function hashSecret(pin: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(pin, salt, KEYLEN, N);
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Constant-time check of a secret against a stored hash. */
export async function verifySecret(
  pin: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;

  const cost = Number(parts[1]);
  if (!Number.isInteger(cost) || cost <= 0) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[2], 'base64');
    expected = Buffer.from(parts[3], 'base64');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const actual = await scryptAsync(pin, salt, expected.length, cost);
  return timingSafeEqual(actual, expected);
}
