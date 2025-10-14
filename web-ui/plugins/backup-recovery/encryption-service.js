/**
 * Encryption Service
 * Backup encryption and decryption with AES-256-GCM
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { logger } = require('../../shared/logger');

class EncryptionService {
  constructor(db) {
    this.db = db;
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.saltLength = 64;
    this.tagLength = 16;
  }

  async init() {
    logger.info('[EncryptionService] Initializing...');
    logger.info(`[EncryptionService] Algorithm: ${this.algorithm}`);
    logger.info('[EncryptionService] ✅ Initialized');
  }

  /**
   * Encrypt a file
   */
  async encryptFile(filePath, tenantId, backupId) {
    try {
      logger.info(`[EncryptionService] Encrypting file: ${filePath}`);

      // Generate encryption key for this backup
      const salt = crypto.randomBytes(this.saltLength);
      const key = await this.deriveKey(tenantId, salt);
      const iv = crypto.randomBytes(this.ivLength);

      // Output file
      const encryptedPath = `${filePath}.encrypted`;

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      // Create streams
      const input = createReadStream(filePath);
      const output = createWriteStream(encryptedPath);

      // Write header (salt + iv)
      await fs.writeFile(encryptedPath, Buffer.concat([salt, iv]));

      // Append encrypted data
      const appendStream = createWriteStream(encryptedPath, { flags: 'a' });

      // Encrypt file
      await pipeline(
        input,
        cipher,
        appendStream
      );

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Append tag
      await fs.appendFile(encryptedPath, tag);

      // Store encryption metadata
      await this.storeEncryptionMetadata(backupId, {
        algorithm: this.algorithm,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      });

      // Get encrypted file size
      const stats = await fs.stat(encryptedPath);

      logger.info(`[EncryptionService] File encrypted successfully (${this.formatBytes(stats.size)})`);

      return {
        path: encryptedPath,
        size: stats.size,
        encrypted: true
      };

    } catch (error) {
      logger.error(`[EncryptionService] Encryption failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decrypt a file
   */
  async decryptFile(encryptedPath, tenantId, backupId) {
    try {
      logger.info(`[EncryptionService] Decrypting file: ${encryptedPath}`);

      // Read encryption metadata
      const metadata = await this.getEncryptionMetadata(backupId);
      if (!metadata) {
        throw new Error('Encryption metadata not found');
      }

      // Read header
      const headerSize = this.saltLength + this.ivLength;
      const header = Buffer.alloc(headerSize);
      const fd = await fs.open(encryptedPath, 'r');
      await fd.read(header, 0, headerSize, 0);

      const salt = header.slice(0, this.saltLength);
      const iv = header.slice(this.saltLength);

      // Read authentication tag (last 16 bytes)
      const stats = await fs.stat(encryptedPath);
      const tag = Buffer.alloc(this.tagLength);
      await fd.read(tag, 0, this.tagLength, stats.size - this.tagLength);
      await fd.close();

      // Derive key
      const key = await this.deriveKey(tenantId, salt);

      // Output file
      const decryptedPath = encryptedPath.replace('.encrypted', '');

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);

      // Create streams (skip header, exclude tag)
      const input = createReadStream(encryptedPath, {
        start: headerSize,
        end: stats.size - this.tagLength - 1
      });
      const output = createWriteStream(decryptedPath);

      // Decrypt file
      await pipeline(
        input,
        decipher,
        output
      );

      const decryptedStats = await fs.stat(decryptedPath);

      logger.info(`[EncryptionService] File decrypted successfully (${this.formatBytes(decryptedStats.size)})`);

      return {
        path: decryptedPath,
        size: decryptedStats.size,
        decrypted: true
      };

    } catch (error) {
      logger.error(`[EncryptionService] Decryption failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Derive encryption key from tenant ID and salt
   */
  async deriveKey(tenantId, salt) {
    return new Promise((resolve, reject) => {
      // Use PBKDF2 for key derivation
      crypto.pbkdf2(
        tenantId,
        salt,
        100000, // iterations
        this.keyLength,
        'sha256',
        (err, key) => {
          if (err) reject(err);
          else resolve(key);
        }
      );
    });
  }

  /**
   * Store encryption metadata
   */
  async storeEncryptionMetadata(backupId, metadata) {
    try {
      const query = `
        UPDATE backups 
        SET metadata = ?
        WHERE id = ?
      `;

      await this.db.run(query, [
        JSON.stringify({ encryption: metadata }),
        backupId
      ]);

    } catch (error) {
      logger.error(`[EncryptionService] Failed to store metadata: ${error.message}`);
    }
  }

  /**
   * Get encryption metadata
   */
  async getEncryptionMetadata(backupId) {
    try {
      const query = 'SELECT metadata FROM backups WHERE id = ?';
      const result = await this.db.get(query, [backupId]);

      if (!result || !result.metadata) {
        return null;
      }

      const metadata = JSON.parse(result.metadata);
      return metadata.encryption || null;

    } catch (error) {
      logger.error(`[EncryptionService] Failed to get metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Encrypt data buffer
   */
  encryptBuffer(data, tenantId) {
    const salt = crypto.randomBytes(this.saltLength);
    const key = crypto.pbkdf2Sync(tenantId, salt, 100000, this.keyLength, 'sha256');
    const iv = crypto.randomBytes(this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    return {
      data: Buffer.concat([salt, iv, encrypted, tag]),
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  /**
   * Decrypt data buffer
   */
  decryptBuffer(encryptedData, tenantId) {
    const salt = encryptedData.slice(0, this.saltLength);
    const iv = encryptedData.slice(this.saltLength, this.saltLength + this.ivLength);
    const tag = encryptedData.slice(-this.tagLength);
    const encrypted = encryptedData.slice(
      this.saltLength + this.ivLength,
      -this.tagLength
    );

    const key = crypto.pbkdf2Sync(tenantId, salt, 100000, this.keyLength, 'sha256');

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted;
  }

  /**
   * Verify encryption is working
   */
  async testEncryption(tenantId) {
    try {
      const testData = Buffer.from('Test encryption data');
      
      // Encrypt
      const encrypted = this.encryptBuffer(testData, tenantId);
      
      // Decrypt
      const decrypted = this.decryptBuffer(encrypted.data, tenantId);
      
      // Verify
      return testData.equals(decrypted);

    } catch (error) {
      logger.error(`[EncryptionService] Encryption test failed: ${error.message}`);
      return false;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = EncryptionService;
