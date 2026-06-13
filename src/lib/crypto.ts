/**
 * Browser-side AES-GCM encryption for the credential store.
 *
 * The user is asked for a passphrase once per session. We derive a key with
 * PBKDF2 (200k iterations, SHA-256) and use it to encrypt the credential
 * blob before writing to localStorage. The passphrase itself is held in
 * `sessionStorage` only — clearing the tab wipes it.
 *
 * This is defense-in-depth, not perfect security: anyone with XSS on the
 * page can grab the passphrase from sessionStorage. The threat model in
 * the blueprint accepts that residual risk; encrypting at rest still
 * protects against casual disk-level inspection and shared-machine theft.
 */

const ENC = new TextEncoder();
const DEC = new TextDecoder();

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    ENC.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 200_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJSON(data: unknown, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ENC.encode(JSON.stringify(data)),
  );
  return JSON.stringify({ v: 1, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) });
}

export async function decryptJSON<T = unknown>(payload: string, passphrase: string): Promise<T> {
  const obj = JSON.parse(payload) as { v: number; salt: string; iv: string; ct: string };
  if (obj.v !== 1) throw new Error("Unsupported ciphertext version");
  const key = await deriveKey(passphrase, fromB64(obj.salt));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(obj.iv) as BufferSource },
    key,
    fromB64(obj.ct) as BufferSource,
  );
  return JSON.parse(DEC.decode(pt)) as T;
}
