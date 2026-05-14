// Quest .synth AES decryption via Web Crypto API
//
// Quest .synth files are standard ZIP archives where beatmap.meta.bin
// is encrypted with WinZip AES-256 (AE-2 format).
//
// WinZip AE-2 spec (per APPNOTE 6.3.5):
//   Compression method in ZIP header = 99
//   Extra field tag 0x9901 contains: version, vendor "AE", strength, actual comp method
//   Encrypted data format: [salt][password_verification(2 bytes)][AES-CTR ciphertext][HMAC-SHA1(10 bytes)]
//   Key derivation: PBKDF2-HMAC-SHA1, 1000 iterations (< 25 char passwords), 10000 (>= 25)
//   Salt length: 8 (128-bit), 12 (192-bit), 16 (256-bit)
//   Master key: 2 × keySize + 2 bytes (enc key + auth key + verification)

const QUEST_PASSWORD = 'hC2*wE5R*qQzv@a!'

/** Salt size per AES strength */
function saltSize(strength: 1 | 2 | 3): number {
  return [8, 12, 16][strength - 1]
}

/** Key size per AES strength */
function keySize(strength: 1 | 2 | 3): number {
  return [16, 24, 32][strength - 1]
}

/** PBKDF2 iterations based on password length */
function pbkdf2Iterations(password: string): number {
  return password.length < 25 ? 1000 : 10000
}

/**
 * Derive master key via PBKDF2-HMAC-SHA1.
 * Returns { encKey, authKey, verification }.
 */
async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  strength: 1 | 2 | 3,
): Promise<{ encKey: Uint8Array; authKey: Uint8Array; verification: Uint8Array }> {
  const ks = keySize(strength)
  const masterLen = 2 * ks + 2
  const iterations = pbkdf2Iterations(password)

  const enc = new TextEncoder()
  const pwKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const masterBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-1',
    },
    pwKey,
    masterLen * 8,
  )

  const master = new Uint8Array(masterBits)
  return {
    encKey: master.slice(0, ks),
    authKey: master.slice(ks, 2 * ks),
    verification: master.slice(2 * ks, 2 * ks + 2),
  }
}

/**
 * AES-CTR decrypt. The counter starts at 1 (128-bit big-endian).
 */
async function aesCtrDecrypt(
  key: Uint8Array,
  counter: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-CTR', length: 128 },
    false,
    ['decrypt'],
  )

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter, length: 128 },
    cryptoKey,
    ciphertext,
  )

  return new Uint8Array(plaintext)
}

/**
 * Decrypt Quest-encrypted beatmap.meta.bin (WinZip AE-2 format).
 *
 * AE-2 encrypted data layout:
 *   [salt: 16 bytes][pwd_verify: 2 bytes][AES-CTR ciphertext (incl. Deflate stream)][HMAC: 10 bytes]
 *
 * Returns the decompressed JSON string, or null if decryption fails.
 */
export async function decryptQuestBeatmap(
  encryptedBytes: Uint8Array,
  password: string = QUEST_PASSWORD,
): Promise<string | null> {
  const strength: 1 | 2 | 3 = 3 // AES-256
  const ss = saltSize(strength)

  if (encryptedBytes.length < ss + 2 + 16 + 10) {
    return null
  }

  // Parse AE-2 structure
  const salt = encryptedBytes.slice(0, ss)
  const storedVerification = encryptedBytes.slice(ss, ss + 2)
  // ciphertext = rest minus 10-byte HMAC at end
  const ciphertextEnd = encryptedBytes.length - 10
  if (ciphertextEnd <= ss + 2) return null
  const ciphertext = encryptedBytes.slice(ss + 2, ciphertextEnd)

  // Derive keys
  let keys: { encKey: Uint8Array; authKey: Uint8Array; verification: Uint8Array }
  try {
    keys = await deriveMasterKey(password, salt, strength)
  } catch {
    return null
  }

  // Verify password
  if (
    keys.verification[0] !== storedVerification[0] ||
    keys.verification[1] !== storedVerification[1]
  ) {
    return null // wrong password
  }

  // AES-CTR decrypt with counter = 1 (128-bit big-endian)
  const counter = new Uint8Array(16)
  counter[15] = 1 // counter starts at 1

  let plaintext: Uint8Array
  try {
    plaintext = await aesCtrDecrypt(keys.encKey, counter, ciphertext)
  } catch {
    return null
  }

  // Decompress DEFLATE (raw deflate, not zlib/gzip)
  try {
    const decompressed = await decompressDeflate(plaintext)
    return new TextDecoder().decode(decompressed)
  } catch {
    // If decompression fails, try as plain text
    try {
      return new TextDecoder().decode(plaintext)
    } catch {
      return null
    }
  }
}

/**
 * Decompress raw DEFLATE stream via DecompressionStream.
 */
async function decompressDeflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()

  void writer.write(data)
  void writer.close()

  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
  } catch {
    throw new Error('DEFLATE decompression failed')
  } finally {
    reader.releaseLock()
  }

  if (chunks.length === 0) throw new Error('No data after decompression')

  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/**
 * Check if a Uint8Array looks like encrypted data (not plain JSON).
 */
export function looksEncrypted(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false
  const firstByte = bytes[0]
  return firstByte !== 0x7b && // '{'
         firstByte !== 0x5b && // '['
         firstByte !== 0x22 && // '"'
         firstByte !== 0x20 && // ' '
         firstByte !== 0x09 && // '\t'
         firstByte !== 0x0a && // '\n'
         firstByte !== 0x0d    // '\r'
}

/**
 * Try loading a beatmap.meta.bin from a ZIP entry-like interface.
 * Works with JSZip entries in browser context.
 */
export async function loadBeatmapMeta(
  zipEntry: { async: (type: 'uint8array') => Promise<Uint8Array> },
): Promise<Record<string, unknown> | null> {
  const bytes = await zipEntry.async('uint8array')

  // Try plain JSON first
  try {
    const text = new TextDecoder().decode(bytes)
    return JSON.parse(text)
  } catch {
    // Not plain JSON — might be encrypted
  }

  if (!looksEncrypted(bytes)) return null

  const decrypted = await decryptQuestBeatmap(bytes)
  if (decrypted) {
    try {
      return JSON.parse(decrypted)
    } catch {
      return null
    }
  }

  return null
}

export { QUEST_PASSWORD }
