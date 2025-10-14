/**
 * Verification Service
 * Cryptographic verification using GPG signatures and checksums
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const { logger } = require('../../shared/logger');

const execAsync = promisify(exec);

class VerificationService {
  constructor() {
    this.gpgAvailable = false;
  }

  async init() {
    logger.info('[VerificationService] Initializing...');
    await this.checkGPG();
    logger.info(`[VerificationService] GPG Available: ${this.gpgAvailable}`);
    logger.info('[VerificationService] ✅ Initialized');
  }

  /**
   * Check if GPG is available
   */
  async checkGPG() {
    try {
      await execAsync('gpg --version');
      this.gpgAvailable = true;
    } catch (error) {
      this.gpgAvailable = false;
      logger.warn('[VerificationService] GPG not available - signature verification disabled');
    }
  }

  /**
   * Verify file integrity using checksum
   */
  async verifyChecksum(filePath, expectedChecksum, algorithm = 'sha256') {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash(algorithm);
      hash.update(fileBuffer);
      const actualChecksum = hash.digest('hex');

      const verified = actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
      
      if (verified) {
        logger.info(`[VerificationService] Checksum verified: ${filePath}`);
      } else {
        logger.error(`[VerificationService] Checksum mismatch for ${filePath}`);
        logger.error(`  Expected: ${expectedChecksum}`);
        logger.error(`  Actual: ${actualChecksum}`);
      }

      return verified;
    } catch (error) {
      logger.error('[VerificationService] Checksum verification failed:', error);
      return false;
    }
  }

  /**
   * Verify GPG signature
   */
  async verifySignature(filePath, signaturePath) {
    if (!this.gpgAvailable) {
      logger.warn('[VerificationService] GPG not available - skipping signature verification');
      return false;
    }

    try {
      const { stdout, stderr } = await execAsync(`gpg --verify "${signaturePath}" "${filePath}"`);
      
      const output = stdout + stderr;
      const verified = output.includes('Good signature');

      if (verified) {
        logger.info(`[VerificationService] GPG signature verified: ${filePath}`);
      } else {
        logger.error(`[VerificationService] GPG signature verification failed: ${filePath}`);
      }

      return verified;
    } catch (error) {
      logger.error('[VerificationService] Signature verification error:', error);
      return false;
    }
  }

  /**
   * Comprehensive verification (signature + checksum)
   */
  async verify(filePath, options = {}) {
    const results = {
      file: filePath,
      checksumVerified: false,
      signatureVerified: false,
      overallValid: false
    };

    // Verify checksum if provided
    if (options.checksum) {
      results.checksumVerified = await this.verifyChecksum(
        filePath,
        options.checksum,
        options.algorithm || 'sha256'
      );
    }

    // Verify signature if provided
    if (options.signaturePath) {
      results.signatureVerified = await this.verifySignature(filePath, options.signaturePath);
    }

    // Overall validation
    if (options.checksum && options.signaturePath) {
      // Both must pass
      results.overallValid = results.checksumVerified && results.signatureVerified;
    } else if (options.checksum) {
      // Only checksum required
      results.overallValid = results.checksumVerified;
    } else if (options.signaturePath) {
      // Only signature required
      results.overallValid = results.signatureVerified;
    }

    return results;
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(filePath, algorithm = 'sha256') {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash(algorithm);
      hash.update(fileBuffer);
      return hash.digest('hex');
    } catch (error) {
      logger.error('[VerificationService] Checksum calculation failed:', error);
      throw error;
    }
  }

  /**
   * Verify multiple checksums
   */
  async verifyMultipleChecksums(filePath, checksums) {
    const results = {};
    
    for (const [algorithm, expected] of Object.entries(checksums)) {
      results[algorithm] = await this.verifyChecksum(filePath, expected, algorithm);
    }

    return results;
  }

  /**
   * Import GPG public key
   */
  async importPublicKey(keyData) {
    if (!this.gpgAvailable) {
      logger.warn('[VerificationService] GPG not available');
      return false;
    }

    try {
      const { stdout } = await execAsync(`echo "${keyData}" | gpg --import`);
      logger.info('[VerificationService] GPG key imported successfully');
      return true;
    } catch (error) {
      logger.error('[VerificationService] GPG key import failed:', error);
      return false;
    }
  }
}

module.exports = VerificationService;
