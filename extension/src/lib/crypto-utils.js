/**
 * FreeClipboard Extension - Crypto Utilities
 * Encryption helpers for sensitive data
 */

class CryptoUtils {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.ivLength = 12;
  }

  // ============================================
  // KEY MANAGEMENT
  // ============================================

  async generateKey() {
    return crypto.subtle.generateKey(
      {
        name: this.algorithm,
        length: this.keyLength
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
  }

  async deriveKey(password, salt) {
    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Derive actual key
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: this.algorithm,
        length: this.keyLength
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async exportKey(key) {
    const exported = await crypto.subtle.exportKey('raw', key);
    return Array.from(new Uint8Array(exported));
  }

  async importKey(keyData) {
    return crypto.subtle.importKey(
      'raw',
      new Uint8Array(keyData),
      this.algorithm,
      true,
      ['encrypt', 'decrypt']
    );
  }

  // ============================================
  // ENCRYPTION / DECRYPTION
  // ============================================

  async encrypt(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
    const encoded = new TextEncoder().encode(data);

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv
      },
      key,
      encoded
    );

    // Combine IV + ciphertext
    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv);
    result.set(new Uint8Array(ciphertext), iv.length);

    return this.arrayBufferToBase64(result);
  }

  async decrypt(encryptedData, key) {
    const data = this.base64ToArrayBuffer(encryptedData);
    const iv = data.slice(0, this.ivLength);
    const ciphertext = data.slice(this.ivLength);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: this.algorithm,
        iv
      },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  }

  // ============================================
  // HASHING
  // ============================================

  async hash(data, algorithm = 'SHA-256') {
    const encoded = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest(algorithm, encoded);
    return this.arrayBufferToHex(hashBuffer);
  }

  async hmac(data, key) {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      typeof key === 'string' ? new TextEncoder().encode(key) : key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
    return this.arrayBufferToBase64(signature);
  }

  // ============================================
  // SECURE STORAGE
  // ============================================

  async secureStore(key, data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cryptoKey = await this.deriveKey(password, salt);
    const encrypted = await this.encrypt(JSON.stringify(data), cryptoKey);

    await chrome.storage.local.set({
      [`secure_${key}`]: {
        salt: Array.from(salt),
        data: encrypted,
        timestamp: Date.now()
      }
    });
  }

  async secureRetrieve(key, password) {
    const stored = await chrome.storage.local.get(`secure_${key}`);
    if (!stored[`secure_${key}`]) return null;

    const { salt, data } = stored[`secure_${key}`];
    const cryptoKey = await this.deriveKey(password, new Uint8Array(salt));
    const decrypted = await this.decrypt(data, cryptoKey);

    return JSON.parse(decrypted);
  }

  // ============================================
  // UTILITIES
  // ============================================

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  generateId(length = 16) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  // Constant-time comparison to prevent timing attacks
  timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

// Singleton
let instance = null;

export function getCryptoUtils() {
  if (!instance) {
    instance = new CryptoUtils();
  }
  return instance;
}

export default CryptoUtils;
