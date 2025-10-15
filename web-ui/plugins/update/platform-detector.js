/**
 * Platform Detector Service
 * Detects operating system and available package managers
 */

const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const { logger } = require('../../shared/logger');

const execAsync = promisify(exec);

class PlatformDetector {
  constructor() {
    this.platform = null;
    this.distro = null;
    this.packageManagers = [];
  }

  async init() {
    logger.info('[PlatformDetector] Initializing...');
    await this.detectPlatform();
    await this.detectPackageManagers();
    logger.info(`[PlatformDetector] Platform: ${this.platform}, Distro: ${this.distro || 'N/A'}`);
    logger.info(`[PlatformDetector] Package Managers: ${this.packageManagers.join(', ')}`);
    logger.info('[PlatformDetector] ✅ Initialized');
  }

  /**
   * Detect operating system platform
   */
  async detectPlatform() {
    this.platform = os.platform(); // 'linux', 'darwin', 'win32'
    
    if (this.platform === 'linux') {
      await this.detectLinuxDistro();
    } else if (this.platform === 'darwin') {
      this.distro = 'macOS';
    } else if (this.platform === 'win32') {
      this.distro = await this.detectWindowsVersion();
    }
  }

  /**
   * Detect Linux distribution
   */
  async detectLinuxDistro() {
    try {
      // Try /etc/os-release first (most common)
      const osRelease = await fs.readFile('/etc/os-release', 'utf8');
      const idMatch = osRelease.match(/^ID=(.*)$/m);
      if (idMatch) {
        this.distro = idMatch[1].replace(/"/g, '');
        return;
      }
    } catch (error) {
      // Fallback methods
    }

    try {
      // Try lsb_release
      const { stdout } = await execAsync('lsb_release -is');
      this.distro = stdout.trim().toLowerCase();
    } catch (error) {
      // Last resort - check specific files
      try {
        await fs.access('/etc/debian_version');
        this.distro = 'debian';
      } catch {
        try {
          await fs.access('/etc/redhat-release');
          this.distro = 'redhat';
        } catch {
          this.distro = 'unknown';
        }
      }
    }
  }

  /**
   * Detect Windows version
   */
  async detectWindowsVersion() {
    try {
      const { stdout } = await execAsync('ver');
      if (stdout.includes('Windows 11')) return 'Windows 11';
      if (stdout.includes('Windows 10')) return 'Windows 10';
      if (stdout.includes('Windows Server')) return 'Windows Server';
      return 'Windows';
    } catch (error) {
      return 'Windows';
    }
  }

  /**
   * Detect available package managers
   */
  async detectPackageManagers() {
    const managers = {
      // Linux - Debian/Ubuntu
      'apt': 'apt --version',
      'apt-get': 'apt-get --version',
      'dpkg': 'dpkg --version',
      
      // Linux - RedHat/Fedora/CentOS
      'yum': 'yum --version',
      'dnf': 'dnf --version',
      'rpm': 'rpm --version',
      
      // Linux - Arch
      'pacman': 'pacman --version',
      
      // Linux - openSUSE
      'zypper': 'zypper --version',
      
      // Linux - Universal
      'snap': 'snap version',
      'flatpak': 'flatpak --version',
      
      // macOS
      'brew': 'brew --version',
      'port': 'port version',
      
      // Windows
      'winget': 'winget --version',
      'choco': 'choco --version',
      'scoop': 'scoop --version',
      
      // Language package managers
      'npm': 'npm --version',
      'pip': 'pip --version',
      'pip3': 'pip3 --version',
      'gem': 'gem --version',
      
      // Container
      'docker': 'docker --version',
      'podman': 'podman --version'
    };

    const detected = [];

    for (const [name, command] of Object.entries(managers)) {
      try {
        await execAsync(command);
        detected.push(name);
      } catch (error) {
        // Manager not available
      }
    }

    this.packageManagers = detected;
  }

  /**
   * Check if specific package manager is available
   */
  hasPackageManager(name) {
    return this.packageManagers.includes(name);
  }

  /**
   * Get primary package manager for current platform
   */
  getPrimaryPackageManager() {
    if (this.platform === 'linux') {
      // Priority order for Linux
      if (this.hasPackageManager('apt')) return 'apt';
      if (this.hasPackageManager('dnf')) return 'dnf';
      if (this.hasPackageManager('yum')) return 'yum';
      if (this.hasPackageManager('pacman')) return 'pacman';
      if (this.hasPackageManager('zypper')) return 'zypper';
      if (this.hasPackageManager('snap')) return 'snap';
      if (this.hasPackageManager('flatpak')) return 'flatpak';
    } else if (this.platform === 'darwin') {
      if (this.hasPackageManager('brew')) return 'brew';
      if (this.hasPackageManager('port')) return 'port';
    } else if (this.platform === 'win32') {
      if (this.hasPackageManager('winget')) return 'winget';
      if (this.hasPackageManager('choco')) return 'choco';
      if (this.hasPackageManager('scoop')) return 'scoop';
    }

    return null;
  }

  /**
   * Get all detected information
   */
  async detectAll() {
    return {
      platform: this.platform,
      distro: this.distro,
      arch: os.arch(),
      hostname: os.hostname(),
      packageManagers: this.packageManagers,
      primaryPackageManager: this.getPrimaryPackageManager(),
      nodeVersion: process.version,
      systemInfo: {
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpus: os.cpus().length,
        uptime: os.uptime()
      }
    };
  }

  /**
   * Check if running on supported platform
   */
  isSupported() {
    return ['linux', 'darwin', 'win32'].includes(this.platform);
  }

  /**
   * Get platform-specific paths
   */
  getPaths() {
    // Use local paths relative to the project for web-ui context
    const projectRoot = path.join(__dirname, '..', '..');
    
    const basePaths = {
      config: process.env.CONFIG_DIR || path.join(projectRoot, 'data', 'config'),
      data: process.env.DATA_DIR || path.join(projectRoot, 'data'),
      logs: process.env.LOG_DIR || path.join(projectRoot, 'logs'),
      temp: os.tmpdir()
    };

    // Keep system paths if explicitly set via environment
    if (!process.env.DATA_DIR) {
      // For production deployments, these would be set via environment
      if (this.platform === 'win32') {
        // Windows paths - but fallback to local if not writable
        basePaths.config = path.join(projectRoot, 'data', 'config');
        basePaths.data = path.join(projectRoot, 'data');
        basePaths.logs = path.join(projectRoot, 'logs');
      }
    }

    return basePaths;
  }
}

module.exports = PlatformDetector;
