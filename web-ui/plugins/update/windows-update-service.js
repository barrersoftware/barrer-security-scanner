/**
 * Windows Update Service
 * Handles Windows Update operations via PowerShell and Windows Update API
 * Supports Windows 10, Windows 11, and Windows Server
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { logger } = require('../../shared/logger');

const execAsync = promisify(exec);

class WindowsUpdateService {
  constructor(platformDetector) {
    this.platformDetector = platformDetector;
    this.isWindows = platformDetector.platform === 'win32';
    this.psModule = 'PSWindowsUpdate';
    this.moduleInstalled = false;
  }

  async init() {
    logger.info('[WindowsUpdateService] Initializing...');
    
    if (!this.isWindows) {
      logger.info('[WindowsUpdateService] Not Windows platform, skipping initialization');
      return;
    }

    // Check if PSWindowsUpdate module is installed
    await this.checkPSModule();

    logger.info('[WindowsUpdateService] ✅ Initialized');
  }

  /**
   * Check if PSWindowsUpdate PowerShell module is installed
   */
  async checkPSModule() {
    try {
      const command = `powershell -Command "Get-Module -ListAvailable -Name ${this.psModule}"`;
      const { stdout } = await execAsync(command);
      
      this.moduleInstalled = stdout.includes(this.psModule);
      
      if (this.moduleInstalled) {
        logger.info('[WindowsUpdateService] PSWindowsUpdate module is installed');
      } else {
        logger.warn('[WindowsUpdateService] PSWindowsUpdate module not installed');
        logger.info('[WindowsUpdateService] Install with: Install-Module PSWindowsUpdate -Force');
      }
    } catch (error) {
      logger.warn('[WindowsUpdateService] Could not check PSWindowsUpdate module');
      this.moduleInstalled = false;
    }
  }

  /**
   * Install PSWindowsUpdate module
   */
  async installPSModule() {
    try {
      if (!this.isWindows) {
        throw new Error('Not a Windows platform');
      }

      logger.info('[WindowsUpdateService] Installing PSWindowsUpdate module...');

      const command = `powershell -Command "Install-Module -Name ${this.psModule} -Force -AllowClobber -Scope CurrentUser"`;
      await execAsync(command, { timeout: 120000 }); // 2 minute timeout

      this.moduleInstalled = true;
      logger.info('[WindowsUpdateService] PSWindowsUpdate module installed successfully');

      return { success: true, message: 'Module installed' };

    } catch (error) {
      logger.error(`[WindowsUpdateService] Error installing module: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check for Windows updates
   */
  async checkUpdates(options = {}) {
    try {
      if (!this.isWindows) {
        throw new Error('Windows Update only available on Windows platform');
      }

      logger.info('[WindowsUpdateService] Checking for updates...');

      let command;
      
      if (this.moduleInstalled) {
        // Use PSWindowsUpdate module (preferred)
        command = `powershell -Command "Import-Module PSWindowsUpdate; Get-WindowsUpdate -MicrosoftUpdate -AcceptAll"`;
      } else {
        // Fallback to WUA COM object
        command = this.buildWUACheckCommand();
      }

      const { stdout, stderr } = await execAsync(command, { timeout: 300000 }); // 5 minute timeout

      const updates = this.parseUpdateList(stdout);

      logger.info(`[WindowsUpdateService] Found ${updates.length} updates`);

      return {
        count: updates.length,
        updates: updates,
        method: this.moduleInstalled ? 'PSWindowsUpdate' : 'WUA',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`[WindowsUpdateService] Error checking updates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Install Windows updates
   */
  async installUpdates(options = {}) {
    try {
      if (!this.isWindows) {
        throw new Error('Windows Update only available on Windows platform');
      }

      const {
        autoReboot = false,
        kbNumbers = [],
        category = null, // 'Security', 'Critical', 'Recommended', 'Optional'
        acceptAll = true
      } = options;

      logger.info('[WindowsUpdateService] Installing updates...');

      let command;

      if (this.moduleInstalled) {
        // Use PSWindowsUpdate module
        command = 'powershell -Command "Import-Module PSWindowsUpdate; Install-WindowsUpdate -MicrosoftUpdate';
        
        if (acceptAll) {
          command += ' -AcceptAll';
        }
        
        if (autoReboot) {
          command += ' -AutoReboot';
        } else {
          command += ' -IgnoreReboot';
        }

        if (kbNumbers.length > 0) {
          command += ` -KBArticleID ${kbNumbers.join(',')}`;
        }

        if (category) {
          command += ` -Category '${category}'`;
        }

        command += '"';

      } else {
        // Fallback to WUA COM object
        command = this.buildWUAInstallCommand(options);
      }

      logger.info('[WindowsUpdateService] Executing update installation...');

      // Install updates (this can take a long time)
      const { stdout, stderr } = await execAsync(command, { timeout: 1800000 }); // 30 minute timeout

      const result = this.parseInstallResult(stdout);

      logger.info('[WindowsUpdateService] Updates installed successfully');

      return {
        success: true,
        ...result,
        method: this.moduleInstalled ? 'PSWindowsUpdate' : 'WUA',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`[WindowsUpdateService] Error installing updates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download updates without installing
   */
  async downloadUpdates(kbNumbers = []) {
    try {
      if (!this.isWindows) {
        throw new Error('Windows Update only available on Windows platform');
      }

      logger.info('[WindowsUpdateService] Downloading updates...');

      let command;

      if (this.moduleInstalled) {
        command = 'powershell -Command "Import-Module PSWindowsUpdate; Get-WindowsUpdate -MicrosoftUpdate -Download -AcceptAll';
        
        if (kbNumbers.length > 0) {
          command += ` -KBArticleID ${kbNumbers.join(',')}`;
        }
        
        command += '"';
      } else {
        command = this.buildWUADownloadCommand(kbNumbers);
      }

      const { stdout } = await execAsync(command, { timeout: 900000 }); // 15 minute timeout

      logger.info('[WindowsUpdateService] Updates downloaded successfully');

      return {
        success: true,
        downloaded: this.parseDownloadResult(stdout),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`[WindowsUpdateService] Error downloading updates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get Windows Update history
   */
  async getUpdateHistory(limit = 50) {
    try {
      if (!this.isWindows) {
        throw new Error('Windows Update only available on Windows platform');
      }

      logger.info('[WindowsUpdateService] Retrieving update history...');

      let command;

      if (this.moduleInstalled) {
        command = `powershell -Command "Import-Module PSWindowsUpdate; Get-WUHistory -Last ${limit}"`;
      } else {
        command = this.buildWUAHistoryCommand(limit);
      }

      const { stdout } = await execAsync(command, { timeout: 60000 });

      const history = this.parseUpdateHistory(stdout);

      logger.info(`[WindowsUpdateService] Retrieved ${history.length} history entries`);

      return {
        count: history.length,
        history: history
      };

    } catch (error) {
      logger.error(`[WindowsUpdateService] Error getting history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if reboot is required
   */
  async isRebootRequired() {
    try {
      if (!this.isWindows) {
        return false;
      }

      const command = 'powershell -Command "Test-Path \\"HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired\\""';
      
      const { stdout } = await execAsync(command);
      const required = stdout.trim() === 'True';

      logger.info(`[WindowsUpdateService] Reboot required: ${required}`);

      return required;

    } catch (error) {
      logger.warn(`[WindowsUpdateService] Could not check reboot status: ${error.message}`);
      return false;
    }
  }

  /**
   * Schedule reboot
   */
  async scheduleReboot(delayMinutes = 10) {
    try {
      if (!this.isWindows) {
        throw new Error('Reboot only available on Windows platform');
      }

      logger.info(`[WindowsUpdateService] Scheduling reboot in ${delayMinutes} minutes...`);

      const delaySeconds = delayMinutes * 60;
      const command = `shutdown /r /t ${delaySeconds} /c "System reboot for Windows Updates"`;

      await execAsync(command);

      logger.info('[WindowsUpdateService] Reboot scheduled');

      return {
        success: true,
        delayMinutes: delayMinutes,
        scheduledAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`[WindowsUpdateService] Error scheduling reboot: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cancel scheduled reboot
   */
  async cancelReboot() {
    try {
      if (!this.isWindows) {
        throw new Error('Reboot only available on Windows platform');
      }

      logger.info('[WindowsUpdateService] Cancelling scheduled reboot...');

      const command = 'shutdown /a';
      await execAsync(command);

      logger.info('[WindowsUpdateService] Reboot cancelled');

      return { success: true };

    } catch (error) {
      logger.error(`[WindowsUpdateService] Error cancelling reboot: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get Windows Update settings
   */
  async getUpdateSettings() {
    try {
      if (!this.isWindows) {
        throw new Error('Windows Update only available on Windows platform');
      }

      const command = `powershell -Command "Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU' -ErrorAction SilentlyContinue"`;
      
      const { stdout } = await execAsync(command);

      const settings = this.parseUpdateSettings(stdout);

      return settings;

    } catch (error) {
      logger.warn(`[WindowsUpdateService] Could not get settings: ${error.message}`);
      return { error: error.message };
    }
  }

  // === HELPER METHODS ===

  /**
   * Build WUA COM check command (fallback)
   */
  buildWUACheckCommand() {
    return `powershell -Command "$updateSession = New-Object -ComObject Microsoft.Update.Session; $updateSearcher = $updateSession.CreateUpdateSearcher(); $searchResult = $updateSearcher.Search('IsInstalled=0'); $searchResult.Updates | Select-Object Title, KBArticleIDs, IsDownloaded, MaxDownloadSize | Format-List"`;
  }

  /**
   * Build WUA COM install command (fallback)
   */
  buildWUAInstallCommand(options) {
    return `powershell -Command "$updateSession = New-Object -ComObject Microsoft.Update.Session; $updateSearcher = $updateSession.CreateUpdateSearcher(); $searchResult = $updateSearcher.Search('IsInstalled=0 and IsHidden=0'); $updatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl; foreach($update in $searchResult.Updates) { $updatesToInstall.Add($update) | Out-Null }; $installer = $updateSession.CreateUpdateInstaller(); $installer.Updates = $updatesToInstall; $installResult = $installer.Install(); $installResult"`;
  }

  /**
   * Build WUA COM download command (fallback)
   */
  buildWUADownloadCommand(kbNumbers) {
    return `powershell -Command "$updateSession = New-Object -ComObject Microsoft.Update.Session; $updateSearcher = $updateSession.CreateUpdateSearcher(); $searchResult = $updateSearcher.Search('IsInstalled=0'); $updatesToDownload = New-Object -ComObject Microsoft.Update.UpdateColl; foreach($update in $searchResult.Updates) { $updatesToDownload.Add($update) | Out-Null }; $downloader = $updateSession.CreateUpdateDownloader(); $downloader.Updates = $updatesToDownload; $downloader.Download()"`;
  }

  /**
   * Build WUA history command (fallback)
   */
  buildWUAHistoryCommand(limit) {
    return `powershell -Command "$updateSession = New-Object -ComObject Microsoft.Update.Session; $updateSearcher = $updateSession.CreateUpdateSearcher(); $historyCount = $updateSearcher.GetTotalHistoryCount(); $history = $updateSearcher.QueryHistory(0, [Math]::Min($historyCount, ${limit})); $history | Select-Object Title, Date, ResultCode | Format-List"`;
  }

  // === PARSERS ===

  /**
   * Parse update list output
   */
  parseUpdateList(output) {
    const updates = [];
    const lines = output.split('\n');
    let current = {};

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('Title') || trimmed.startsWith('KB')) {
        if (current.title) {
          updates.push(current);
          current = {};
        }
      }

      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        
        if (key.includes('Title')) {
          current.title = value;
        } else if (key.includes('KB')) {
          current.kb = value;
        } else if (key.includes('Size')) {
          current.size = value;
        } else if (key.includes('Downloaded')) {
          current.downloaded = value.toLowerCase() === 'true';
        }
      }
    }

    if (current.title) {
      updates.push(current);
    }

    return updates;
  }

  /**
   * Parse installation result
   */
  parseInstallResult(output) {
    const result = {
      installed: 0,
      failed: 0,
      rebootRequired: output.toLowerCase().includes('reboot')
    };

    // Extract success count
    const successMatch = output.match(/(\d+)\s+success/i);
    if (successMatch) {
      result.installed = parseInt(successMatch[1]);
    }

    // Extract failure count
    const failMatch = output.match(/(\d+)\s+fail/i);
    if (failMatch) {
      result.failed = parseInt(failMatch[1]);
    }

    return result;
  }

  /**
   * Parse download result
   */
  parseDownloadResult(output) {
    const downloaded = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('Downloaded') || line.includes('KB')) {
        downloaded.push(line.trim());
      }
    }

    return downloaded;
  }

  /**
   * Parse update history
   */
  parseUpdateHistory(output) {
    const history = [];
    const lines = output.split('\n');
    let current = {};

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '' && current.title) {
        history.push(current);
        current = {};
        continue;
      }

      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        
        if (key.includes('Title')) {
          current.title = value;
        } else if (key.includes('Date')) {
          current.date = value;
        } else if (key.includes('Result')) {
          current.result = value;
        }
      }
    }

    if (current.title) {
      history.push(current);
    }

    return history;
  }

  /**
   * Parse update settings
   */
  parseUpdateSettings(output) {
    const settings = {
      autoUpdate: 'unknown',
      scheduledInstallDay: 'unknown',
      scheduledInstallTime: 'unknown'
    };

    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('AUOptions')) {
        const match = line.match(/:\s*(\d+)/);
        if (match) {
          const option = parseInt(match[1]);
          settings.autoUpdate = this.getAUOptionText(option);
        }
      } else if (line.includes('ScheduledInstallDay')) {
        const match = line.match(/:\s*(\d+)/);
        if (match) {
          settings.scheduledInstallDay = this.getDayText(parseInt(match[1]));
        }
      } else if (line.includes('ScheduledInstallTime')) {
        const match = line.match(/:\s*(\d+)/);
        if (match) {
          settings.scheduledInstallTime = `${match[1]}:00`;
        }
      }
    }

    return settings;
  }

  /**
   * Get auto update option text
   */
  getAUOptionText(option) {
    const options = {
      1: 'Disabled',
      2: 'Notify before download',
      3: 'Auto download and notify',
      4: 'Auto download and schedule install',
      5: 'Automatic updates required'
    };
    return options[option] || 'Unknown';
  }

  /**
   * Get day of week text
   */
  getDayText(day) {
    const days = {
      0: 'Every day',
      1: 'Sunday',
      2: 'Monday',
      3: 'Tuesday',
      4: 'Wednesday',
      5: 'Thursday',
      6: 'Friday',
      7: 'Saturday'
    };
    return days[day] || 'Unknown';
  }

  /**
   * Check if service is available
   */
  isAvailable() {
    return this.isWindows;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      available: this.isWindows,
      platform: this.platformDetector.platform,
      distro: this.platformDetector.distro,
      psModuleInstalled: this.moduleInstalled,
      psModuleName: this.psModule
    };
  }
}

module.exports = WindowsUpdateService;
