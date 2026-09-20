/**
 * Cryptographic primitives for the PAN vault (pure functions, no I/O).
 *
 * - Key derivation: scrypt (memory-hard) from a user passphrase + random per-vault salt.
 * - Encryption: XChaCha20-Poly1305 (authenticated) with a fresh random 24-byte nonce per value.
 *   The record id is bound in as associated data, so a ciphertext copied onto another record
 *   fails to decrypt instead of silently showing the wrong PAN.
 *
 * The derived key and the passphrase never leave the device; only ciphertext is stored.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

export interface KdfParams {
  N: number;
  r: number;
  p: number;
}

/** Sealed value as stored remotely. `v` allows future algorithm changes. */
export interface Sealed {
  v: 1;
  /** hex nonce */
  n: string;
  /** hex ciphertext (includes the auth tag) */
  c: string;
}

/**
 * Stored once per vault. PANs are encrypted with a random data key (DEK); the DEK is stored
 * wrapped by a key derived from the passphrase (KEK). Changing the passphrase re-wraps only
 * the DEK, so it is a single atomic write and no PAN needs re-encrypting.
 */
export interface VaultMeta {
  v: 1;
  kdf: 'scrypt';
  params: KdfParams;
  /** hex salt for the KEK */
  salt: string;
  /** The DEK sealed under the KEK; only the right passphrase can open it. */
  wrappedDek: Sealed;
}

// N=2^16, r=8, p=2 (~64 MB): an OWASP-listed scrypt setting that also fits comfortably in mobile Safari.
export const DEFAULT_KDF: KdfParams = { N: 2 ** 16, r: 8, p: 2 };
const DEK_AAD = '__dek__';

export const randomSalt = (): string => bytesToHex(randomBytes(16));

async function deriveKek(passphrase: string, saltHex: string, params: KdfParams): Promise<Uint8Array> {
  // NFKC so the same passphrase typed on different keyboards/OSes derives the same key.
  const pw = utf8ToBytes(passphrase.normalize('NFKC'));
  return scryptAsync(pw, hexToBytes(saltHex), { ...params, dkLen: 32 });
}

export function seal(key: Uint8Array, aad: string, plaintext: string): Sealed {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce, utf8ToBytes(aad)).encrypt(utf8ToBytes(plaintext));
  return { v: 1, n: bytesToHex(nonce), c: bytesToHex(ct) };
}

/** Throws if the key is wrong, the data was altered, or it belongs to a different record id. */
export function open(key: Uint8Array, aad: string, sealed: Sealed): string {
  if (sealed?.v !== 1) throw new Error('Unsupported vault format');
  const pt = xchacha20poly1305(key, hexToBytes(sealed.n), utf8ToBytes(aad)).decrypt(hexToBytes(sealed.c));
  return bytesToUtf8(pt);
}

async function wrapDek(dek: Uint8Array, passphrase: string, params: KdfParams): Promise<VaultMeta> {
  const salt = randomSalt();
  const kek = await deriveKek(passphrase, salt, params);
  const wrappedDek = seal(kek, DEK_AAD, bytesToHex(dek));
  kek.fill(0);
  return { v: 1, kdf: 'scrypt', params, salt, wrappedDek };
}

/** New vault: fresh random DEK wrapped under the passphrase. */
export async function createMeta(passphrase: string, params: KdfParams = DEFAULT_KDF): Promise<{ meta: VaultMeta; dek: Uint8Array }> {
  const dek = randomBytes(32);
  return { dek, meta: await wrapDek(dek, passphrase, params) };
}

/** Returns the DEK when the passphrase is right, otherwise null. */
export async function unwrapDek(passphrase: string, meta: VaultMeta): Promise<Uint8Array | null> {
  const kek = await deriveKek(passphrase, meta.salt, meta.params);
  try {
    return hexToBytes(open(kek, DEK_AAD, meta.wrappedDek));
  } catch {
    return null;
  } finally {
    kek.fill(0);
  }
}

/** Same DEK, new passphrase (new salt). */
export async function rewrapMeta(dek: Uint8Array, newPassphrase: string, params: KdfParams = DEFAULT_KDF): Promise<VaultMeta> {
  return wrapDek(dek, newPassphrase, params);
}
