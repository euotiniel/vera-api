import { createHash, randomBytes } from 'node:crypto';

const PREFIX = 'VRA';

// Crockford Base32: evita I, L, O e U.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeBase32(bytes: Buffer): string {
  let buffer = 0;
  let bits = 0;
  let output = '';

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;

      const index = (buffer >> bits) & 31;
      output += ALPHABET[index];

      if (bits === 0) {
        buffer = 0;
      } else {
        buffer &= (1 << bits) - 1;
      }
    }
  }

  if (bits > 0) {
    const index = (buffer << (5 - bits)) & 31;
    output += ALPHABET[index];
  }

  return output;
}

function generateChecksum(body: string): string {
  const digest = createHash('sha256')
    .update(`${PREFIX}:${body}`)
    .digest();

  const value = ((digest[0] << 8) | digest[1]) >>> 6;

  return (
    ALPHABET[(value >> 5) & 31] +
    ALPHABET[value & 31]
  );
}

export function generatePublicId(): string {
  const body = encodeBase32(randomBytes(10));
  const checksum = generateChecksum(body);

  const groups = body.match(/.{4}/g);

  if (!groups) {
    throw new Error('Failed to generate Vera public ID');
  }

  return `${PREFIX}-${groups.join('-')}-${checksum}`;
}

export function isValidPublicId(publicId: string): boolean {
  const normalized = publicId.trim().toUpperCase();
  const parts = normalized.split('-');

  if (parts.length !== 6) {
    return false;
  }

  if (parts[0] !== PREFIX) {
    return false;
  }

  const bodyGroups = parts.slice(1, 5);
  const checksum = parts[5];

  if (
    bodyGroups.some((group) => group.length !== 4) ||
    checksum.length !== 2
  ) {
    return false;
  }

  const body = bodyGroups.join('');

  const charactersAreValid = [...body, ...checksum].every(
    (character) => ALPHABET.includes(character),
  );

  if (!charactersAreValid) {
    return false;
  }

  return checksum === generateChecksum(body);
}
