/**
 * Simple Logger Utility
 */

class Logger {
    constructor(name) {
        this.name = name;
    }

    info(message, ...args) {
        console.log(`[${this.name}] INFO:`, message, ...args);
    }

    error(message, ...args) {
        console.error(`[${this.name}] ERROR:`, message, ...args);
    }

    warn(message, ...args) {
        console.warn(`[${this.name}] WARN:`, message, ...args);
    }

    debug(message, ...args) {
        console.debug(`[${this.name}] DEBUG:`, message, ...args);
    }
}

function createLogger(name) {
    return new Logger(name);
}

module.exports = { Logger, createLogger };
