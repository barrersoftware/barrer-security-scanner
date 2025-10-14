/**
 * Package Manager Service
 * Universal interface for all package managers across platforms
 * Supports: Linux (apt, yum, dnf, pacman, zypper, snap, flatpak)
 *           macOS (brew, port)
 *           Windows (winget, choco, scoop)
 *           Containers (docker, podman)
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const { logger } = require('../../shared/logger');

const execAsync = promisify(exec);

class PackageManagerService {
  constructor(platformDetector) {
    this.platformDetector = platformDetector;
    this.managers = this.initializeManagers();
  }

  async init() {
    logger.info('[PackageManagerService] Initializing...');
    logger.info(`[PackageManagerService] Platform: ${this.platformDetector.platform}`);
    logger.info(`[PackageManagerService] Available managers: ${this.platformDetector.packageManagers.join(', ')}`);
    logger.info('[PackageManagerService] ✅ Initialized');
  }

  /**
   * Initialize package manager configurations
   */
  initializeManagers() {
    return {
      // === LINUX - DEBIAN/UBUNTU ===
      apt: {
        name: 'apt',
        platform: 'linux',
        commands: {
          update: 'sudo apt update',
          upgrade: 'sudo apt upgrade -y',
          install: (pkg) => `sudo apt install -y ${pkg}`,
          remove: (pkg) => `sudo apt remove -y ${pkg}`,
          search: (pkg) => `apt search ${pkg}`,
          list: 'apt list --upgradable',
          info: (pkg) => `apt show ${pkg}`,
          clean: 'sudo apt autoremove -y && sudo apt autoclean'
        },
        parser: this.parseAptOutput.bind(this)
      },

      'apt-get': {
        name: 'apt-get',
        platform: 'linux',
        commands: {
          update: 'sudo apt-get update',
          upgrade: 'sudo apt-get upgrade -y',
          install: (pkg) => `sudo apt-get install -y ${pkg}`,
          remove: (pkg) => `sudo apt-get remove -y ${pkg}`,
          list: 'apt-get --just-print upgrade',
          clean: 'sudo apt-get autoremove -y && sudo apt-get autoclean'
        },
        parser: this.parseAptGetOutput.bind(this)
      },

      dpkg: {
        name: 'dpkg',
        platform: 'linux',
        commands: {
          list: 'dpkg -l',
          info: (pkg) => `dpkg -s ${pkg}`,
          install: (pkg) => `sudo dpkg -i ${pkg}`,
          remove: (pkg) => `sudo dpkg -r ${pkg}`
        },
        parser: this.parseDpkgOutput.bind(this)
      },

      // === LINUX - REDHAT/FEDORA/CENTOS ===
      yum: {
        name: 'yum',
        platform: 'linux',
        commands: {
          update: 'sudo yum check-update',
          upgrade: 'sudo yum update -y',
          install: (pkg) => `sudo yum install -y ${pkg}`,
          remove: (pkg) => `sudo yum remove -y ${pkg}`,
          search: (pkg) => `yum search ${pkg}`,
          list: 'yum list updates',
          info: (pkg) => `yum info ${pkg}`,
          clean: 'sudo yum clean all'
        },
        parser: this.parseYumOutput.bind(this)
      },

      dnf: {
        name: 'dnf',
        platform: 'linux',
        commands: {
          update: 'sudo dnf check-update',
          upgrade: 'sudo dnf upgrade -y',
          install: (pkg) => `sudo dnf install -y ${pkg}`,
          remove: (pkg) => `sudo dnf remove -y ${pkg}`,
          search: (pkg) => `dnf search ${pkg}`,
          list: 'dnf list --upgrades',
          info: (pkg) => `dnf info ${pkg}`,
          clean: 'sudo dnf clean all'
        },
        parser: this.parseDnfOutput.bind(this)
      },

      rpm: {
        name: 'rpm',
        platform: 'linux',
        commands: {
          list: 'rpm -qa',
          info: (pkg) => `rpm -qi ${pkg}`,
          install: (pkg) => `sudo rpm -i ${pkg}`,
          remove: (pkg) => `sudo rpm -e ${pkg}`,
          verify: (pkg) => `rpm -V ${pkg}`
        },
        parser: this.parseRpmOutput.bind(this)
      },

      // === LINUX - ARCH ===
      pacman: {
        name: 'pacman',
        platform: 'linux',
        commands: {
          update: 'sudo pacman -Sy',
          upgrade: 'sudo pacman -Syu --noconfirm',
          install: (pkg) => `sudo pacman -S --noconfirm ${pkg}`,
          remove: (pkg) => `sudo pacman -R --noconfirm ${pkg}`,
          search: (pkg) => `pacman -Ss ${pkg}`,
          list: 'pacman -Qu',
          info: (pkg) => `pacman -Si ${pkg}`,
          clean: 'sudo pacman -Sc --noconfirm'
        },
        parser: this.parsePacmanOutput.bind(this)
      },

      // === LINUX - OPENSUSE ===
      zypper: {
        name: 'zypper',
        platform: 'linux',
        commands: {
          update: 'sudo zypper refresh',
          upgrade: 'sudo zypper update -y',
          install: (pkg) => `sudo zypper install -y ${pkg}`,
          remove: (pkg) => `sudo zypper remove -y ${pkg}`,
          search: (pkg) => `zypper search ${pkg}`,
          list: 'zypper list-updates',
          info: (pkg) => `zypper info ${pkg}`,
          clean: 'sudo zypper clean'
        },
        parser: this.parseZypperOutput.bind(this)
      },

      // === LINUX - UNIVERSAL ===
      snap: {
        name: 'snap',
        platform: 'linux',
        commands: {
          update: 'sudo snap refresh --list',
          upgrade: 'sudo snap refresh',
          install: (pkg) => `sudo snap install ${pkg}`,
          remove: (pkg) => `sudo snap remove ${pkg}`,
          search: (pkg) => `snap find ${pkg}`,
          list: 'snap list',
          info: (pkg) => `snap info ${pkg}`
        },
        parser: this.parseSnapOutput.bind(this)
      },

      flatpak: {
        name: 'flatpak',
        platform: 'linux',
        commands: {
          update: 'flatpak remote-ls --updates',
          upgrade: 'flatpak update -y',
          install: (pkg) => `flatpak install -y ${pkg}`,
          remove: (pkg) => `flatpak uninstall -y ${pkg}`,
          search: (pkg) => `flatpak search ${pkg}`,
          list: 'flatpak list',
          info: (pkg) => `flatpak info ${pkg}`
        },
        parser: this.parseFlatpakOutput.bind(this)
      },

      // === MACOS ===
      brew: {
        name: 'brew',
        platform: 'darwin',
        commands: {
          update: 'brew update',
          upgrade: 'brew upgrade',
          install: (pkg) => `brew install ${pkg}`,
          remove: (pkg) => `brew uninstall ${pkg}`,
          search: (pkg) => `brew search ${pkg}`,
          list: 'brew outdated',
          info: (pkg) => `brew info ${pkg}`,
          clean: 'brew cleanup'
        },
        parser: this.parseBrewOutput.bind(this)
      },

      port: {
        name: 'port',
        platform: 'darwin',
        commands: {
          update: 'sudo port selfupdate',
          upgrade: 'sudo port upgrade outdated',
          install: (pkg) => `sudo port install ${pkg}`,
          remove: (pkg) => `sudo port uninstall ${pkg}`,
          search: (pkg) => `port search ${pkg}`,
          list: 'port outdated',
          info: (pkg) => `port info ${pkg}`,
          clean: 'sudo port clean --all'
        },
        parser: this.parsePortOutput.bind(this)
      },

      // === WINDOWS ===
      winget: {
        name: 'winget',
        platform: 'win32',
        commands: {
          update: 'winget upgrade --query',
          upgrade: 'winget upgrade --all --silent',
          install: (pkg) => `winget install --silent ${pkg}`,
          remove: (pkg) => `winget uninstall --silent ${pkg}`,
          search: (pkg) => `winget search ${pkg}`,
          list: 'winget list --upgrade-available',
          info: (pkg) => `winget show ${pkg}`
        },
        parser: this.parseWingetOutput.bind(this)
      },

      choco: {
        name: 'choco',
        platform: 'win32',
        commands: {
          update: 'choco outdated',
          upgrade: 'choco upgrade all -y',
          install: (pkg) => `choco install ${pkg} -y`,
          remove: (pkg) => `choco uninstall ${pkg} -y`,
          search: (pkg) => `choco search ${pkg}`,
          list: 'choco list --local-only',
          info: (pkg) => `choco info ${pkg}`
        },
        parser: this.parseChocoOutput.bind(this)
      },

      scoop: {
        name: 'scoop',
        platform: 'win32',
        commands: {
          update: 'scoop update',
          upgrade: 'scoop update *',
          install: (pkg) => `scoop install ${pkg}`,
          remove: (pkg) => `scoop uninstall ${pkg}`,
          search: (pkg) => `scoop search ${pkg}`,
          list: 'scoop list',
          info: (pkg) => `scoop info ${pkg}`,
          clean: 'scoop cleanup *'
        },
        parser: this.parseScoopOutput.bind(this)
      },

      // === CONTAINERS ===
      docker: {
        name: 'docker',
        platform: 'all',
        commands: {
          list: 'docker images',
          pull: (img) => `docker pull ${img}`,
          remove: (img) => `docker rmi ${img}`,
          info: (img) => `docker inspect ${img}`,
          clean: 'docker system prune -af'
        },
        parser: this.parseDockerOutput.bind(this)
      },

      podman: {
        name: 'podman',
        platform: 'all',
        commands: {
          list: 'podman images',
          pull: (img) => `podman pull ${img}`,
          remove: (img) => `podman rmi ${img}`,
          info: (img) => `podman inspect ${img}`,
          clean: 'podman system prune -af'
        },
        parser: this.parsePodmanOutput.bind(this)
      }
    };
  }

  /**
   * Check for available updates
   */
  async checkUpdates(managerName = null) {
    try {
      const manager = managerName || this.platformDetector.getPrimaryPackageManager();
      
      if (!manager) {
        throw new Error('No package manager available');
      }

      if (!this.platformDetector.hasPackageManager(manager)) {
        throw new Error(`Package manager '${manager}' not available`);
      }

      const config = this.managers[manager];
      if (!config) {
        throw new Error(`Package manager '${manager}' not supported`);
      }

      logger.info(`[PackageManagerService] Checking updates with ${manager}...`);

      // First update package lists
      if (config.commands.update) {
        await execAsync(config.commands.update);
      }

      // Then get list of available updates
      const { stdout } = await execAsync(config.commands.list);
      const updates = config.parser(stdout);

      logger.info(`[PackageManagerService] Found ${updates.length} updates`);
      
      return {
        manager: manager,
        count: updates.length,
        updates: updates,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`[PackageManagerService] Error checking updates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Install updates
   */
  async installUpdates(managerName = null, packages = []) {
    try {
      const manager = managerName || this.platformDetector.getPrimaryPackageManager();
      
      if (!manager) {
        throw new Error('No package manager available');
      }

      const config = this.managers[manager];
      if (!config) {
        throw new Error(`Package manager '${manager}' not supported`);
      }

      logger.info(`[PackageManagerService] Installing updates with ${manager}...`);

      let command;
      if (packages.length > 0) {
        // Install specific packages
        command = config.commands.install(packages.join(' '));
      } else {
        // Upgrade all packages
        command = config.commands.upgrade;
      }

      const { stdout, stderr } = await execAsync(command);

      logger.info(`[PackageManagerService] Updates installed successfully`);
      
      return {
        success: true,
        manager: manager,
        packages: packages,
        output: stdout,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`[PackageManagerService] Error installing updates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Install specific package
   */
  async installPackage(packageName, managerName = null) {
    try {
      const manager = managerName || this.platformDetector.getPrimaryPackageManager();
      const config = this.managers[manager];

      if (!config) {
        throw new Error(`Package manager '${manager}' not supported`);
      }

      logger.info(`[PackageManagerService] Installing package: ${packageName} with ${manager}`);

      const command = config.commands.install(packageName);
      const { stdout } = await execAsync(command);

      logger.info(`[PackageManagerService] Package installed: ${packageName}`);

      return {
        success: true,
        package: packageName,
        manager: manager,
        output: stdout
      };

    } catch (error) {
      logger.error(`[PackageManagerService] Error installing package: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove specific package
   */
  async removePackage(packageName, managerName = null) {
    try {
      const manager = managerName || this.platformDetector.getPrimaryPackageManager();
      const config = this.managers[manager];

      if (!config) {
        throw new Error(`Package manager '${manager}' not supported`);
      }

      logger.info(`[PackageManagerService] Removing package: ${packageName} with ${manager}`);

      const command = config.commands.remove(packageName);
      const { stdout } = await execAsync(command);

      logger.info(`[PackageManagerService] Package removed: ${packageName}`);

      return {
        success: true,
        package: packageName,
        manager: manager,
        output: stdout
      };

    } catch (error) {
      logger.error(`[PackageManagerService] Error removing package: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search for packages
   */
  async searchPackages(query, managerName = null) {
    try {
      const manager = managerName || this.platformDetector.getPrimaryPackageManager();
      const config = this.managers[manager];

      if (!config || !config.commands.search) {
        throw new Error(`Search not supported for '${manager}'`);
      }

      const { stdout } = await execAsync(config.commands.search(query));
      
      return {
        query: query,
        manager: manager,
        results: stdout.split('\n').filter(line => line.trim())
      };

    } catch (error) {
      logger.error(`[PackageManagerService] Error searching packages: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get package information
   */
  async getPackageInfo(packageName, managerName = null) {
    try {
      const manager = managerName || this.platformDetector.getPrimaryPackageManager();
      const config = this.managers[manager];

      if (!config || !config.commands.info) {
        throw new Error(`Info not supported for '${manager}'`);
      }

      const { stdout } = await execAsync(config.commands.info(packageName));
      
      return {
        package: packageName,
        manager: manager,
        info: stdout
      };

    } catch (error) {
      logger.error(`[PackageManagerService] Error getting package info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean package manager cache
   */
  async cleanCache(managerName = null) {
    try {
      const manager = managerName || this.platformDetector.getPrimaryPackageManager();
      const config = this.managers[manager];

      if (!config || !config.commands.clean) {
        logger.warn(`[PackageManagerService] Clean not supported for '${manager}'`);
        return { success: false, message: 'Not supported' };
      }

      logger.info(`[PackageManagerService] Cleaning cache for ${manager}...`);

      await execAsync(config.commands.clean);

      logger.info(`[PackageManagerService] Cache cleaned successfully`);

      return {
        success: true,
        manager: manager
      };

    } catch (error) {
      logger.error(`[PackageManagerService] Error cleaning cache: ${error.message}`);
      throw error;
    }
  }

  // === OUTPUT PARSERS ===

  parseAptOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('/') && !line.startsWith('Listing')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          updates.push({
            name: parts[0],
            version: parts[1],
            source: parts[2] || 'unknown'
          });
        }
      }
    }
    
    return updates;
  }

  parseAptGetOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('Inst ')) {
        const match = line.match(/Inst (\S+) \[(\S+)\] \((\S+)/);
        if (match) {
          updates.push({
            name: match[1],
            currentVersion: match[2],
            newVersion: match[3]
          });
        }
      }
    }
    
    return updates;
  }

  parseDpkgOutput(output) {
    const packages = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('ii ')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          packages.push({
            name: parts[1],
            version: parts[2],
            description: parts.slice(3).join(' ')
          });
        }
      }
    }
    
    return packages;
  }

  parseYumOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2 && !line.includes('Obsoleting')) {
        updates.push({
          name: parts[0],
          version: parts[1],
          repo: parts[2] || 'unknown'
        });
      }
    }
    
    return updates;
  }

  parseDnfOutput(output) {
    return this.parseYumOutput(output); // Similar format
  }

  parseRpmOutput(output) {
    const packages = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        packages.push({
          name: line.trim()
        });
      }
    }
    
    return packages;
  }

  parsePacmanOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        updates.push({
          name: parts[0],
          currentVersion: parts[1].split('->')[0],
          newVersion: parts[1].split('->')[1]
        });
      }
    }
    
    return updates;
  }

  parseZypperOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('|')) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 4) {
          updates.push({
            name: parts[2],
            version: parts[4]
          });
        }
      }
    }
    
    return updates;
  }

  parseSnapOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2 && !line.includes('Name')) {
        updates.push({
          name: parts[0],
          version: parts[1]
        });
      }
    }
    
    return updates;
  }

  parseFlatpakOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        updates.push({
          name: parts[0],
          version: parts[1]
        });
      }
    }
    
    return updates;
  }

  parseBrewOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        updates.push({
          name: parts[0],
          currentVersion: parts[1],
          newVersion: parts[3] || 'latest'
        });
      }
    }
    
    return updates;
  }

  parsePortOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('<') || line.includes('>')) {
        const parts = line.split(/\s+/);
        updates.push({
          name: parts[0],
          currentVersion: parts[1],
          newVersion: parts[2]
        });
      }
    }
    
    return updates;
  }

  parseWingetOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const parts = line.split(/\s{2,}/);
      if (parts.length >= 3 && !line.includes('Name')) {
        updates.push({
          name: parts[0].trim(),
          currentVersion: parts[1].trim(),
          newVersion: parts[2].trim()
        });
      }
    }
    
    return updates;
  }

  parseChocoOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('|')) {
        const parts = line.split('|');
        if (parts.length >= 3) {
          updates.push({
            name: parts[0].trim(),
            currentVersion: parts[1].trim(),
            newVersion: parts[2].trim()
          });
        }
      }
    }
    
    return updates;
  }

  parseScoopOutput(output) {
    const updates = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2 && !line.includes('Name')) {
        updates.push({
          name: parts[0],
          version: parts[1]
        });
      }
    }
    
    return updates;
  }

  parseDockerOutput(output) {
    const images = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const parts = line.split(/\s{2,}/);
      if (parts.length >= 3 && !line.includes('REPOSITORY')) {
        images.push({
          repository: parts[0],
          tag: parts[1],
          imageId: parts[2]
        });
      }
    }
    
    return images;
  }

  parsePodmanOutput(output) {
    return this.parseDockerOutput(output); // Similar format
  }

  /**
   * Get list of available package managers
   */
  getAvailableManagers() {
    return this.platformDetector.packageManagers.map(name => {
      const config = this.managers[name];
      return {
        name: name,
        platform: config ? config.platform : 'unknown',
        available: true
      };
    });
  }

  /**
   * Get supported package managers for current platform
   */
  getSupportedManagers() {
    const platform = this.platformDetector.platform;
    const supported = [];

    for (const [name, config] of Object.entries(this.managers)) {
      if (config.platform === platform || config.platform === 'all') {
        supported.push({
          name: name,
          platform: config.platform,
          installed: this.platformDetector.hasPackageManager(name)
        });
      }
    }

    return supported;
  }
}

module.exports = PackageManagerService;
