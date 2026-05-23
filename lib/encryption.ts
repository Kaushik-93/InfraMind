import crypto from "crypto"

/**
 * Encryption Key - Derived securely from process environment or
 * padded fallback of exactly 32 bytes for AES-256-CBC.
 */
const SECRET_KEY = process.env.INFRAMIND_SECRET || "inframind_secret_key_32_bytes_!"
const ALGORITHM = "aes-256-cbc"

// Ensure KEY is exactly 32 bytes
const KEY_BUFFER = Buffer.alloc(32)
Buffer.from(SECRET_KEY, "utf8").copy(KEY_BUFFER)

/**
 * Encrypt a plain-text code or metadata string using AES-256-CBC.
 * Outputs format: iv_hex:cipher_text_hex
 *
 * @param text Original plain-text content
 * @returns Encrypted hex cipher string with IV prefix
 */
export function encrypt(text: string): string {
  if (!text) return ""
  
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv)
  
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  
  return `${iv.toString("hex")}:${encrypted}`
}

/**
 * Decrypt a cipher string containing hex IV prepended by a colon.
 *
 * @param encryptedText Cipher text in format iv_hex:cipher_text_hex
 * @returns Original plain-text content
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return ""
  
  try {
    const parts = encryptedText.split(":")
    // Fallback gracefully if the input is not formatted with an IV
    if (parts.length !== 2) {
      return encryptedText
    }
    
    const iv = Buffer.from(parts[0], "hex")
    const encrypted = parts[1]
    
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv)
    let decrypted = decipher.update(encrypted, "hex", "utf8")
    decrypted += decipher.final("utf8")
    
    return decrypted
  } catch (err) {
    console.error("[Encryption] Decryption failed. Content might be raw plain text or corrupted:", err)
    return encryptedText
  }
}
