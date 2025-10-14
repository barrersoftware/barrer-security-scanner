/**
 * IP Tracker Service
 * Tracks IP address activity and patterns
 */

const crypto = require('crypto');
const { logger } = require('../../shared/logger');

class IPTracker {
  constructor(db) {
    this.db = db;
    this.recentRequests = new Map(); // In-memory cache for performance
  }

  async init() {
    logger.info('[IPTracker] Initializing...');
    logger.info('[IPTracker] ✅ Initialized');
  }

  /**
   * Track request from IP
   */
  trackRequest(ip, endpoint, method, userAgent = null) {
    const key = `${ip}:${endpoint}`;
    const now = Date.now();

    if (!this.recentRequests.has(key)) {
      this.recentRequests.set(key, []);
    }

    const requests = this.recentRequests.get(key);
    requests.push({
      timestamp: now,
      method,
      userAgent
    });

    // Keep only last 1000 requests per IP/endpoint
    if (requests.length > 1000) {
      requests.shift();
    }

    // Clean old requests (older than 1 hour)
    const oneHourAgo = now - (3600 * 1000);
    this.recentRequests.set(
      key,
      requests.filter(r => r.timestamp > oneHourAgo)
    );
  }

  /**
   * Get request rate for IP
   */
  getRequestRate(ip, endpoint, windowSeconds = 60) {
    const key = `${ip}:${endpoint}`;
    const requests = this.recentRequests.get(key) || [];
    
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    
    const recentRequests = requests.filter(r => r.timestamp > windowStart);
    
    return {
      count: recentRequests.length,
      rate: recentRequests.length / windowSeconds,
      window: windowSeconds
    };
  }

  /**
   * Check if IP is making suspicious requests
   */
  isSuspicious(ip, endpoint = null) {
    // Check various patterns
    const patterns = {
      highFrequency: this.checkHighFrequency(ip, endpoint),
      uniformTiming: this.checkUniformTiming(ip, endpoint),
      multipleEndpoints: this.checkMultipleEndpoints(ip),
      singleUserAgent: this.checkSingleUserAgent(ip)
    };

    const suspiciousCount = Object.values(patterns).filter(p => p).length;

    return {
      suspicious: suspiciousCount >= 2,
      reasons: Object.keys(patterns).filter(k => patterns[k]),
      patterns: patterns
    };
  }

  /**
   * Check for high frequency requests
   */
  checkHighFrequency(ip, endpoint) {
    const rate = this.getRequestRate(ip, endpoint || '*', 10);
    return rate.rate > 10; // More than 10 requests per second
  }

  /**
   * Check for uniform timing (bot-like behavior)
   */
  checkUniformTiming(ip, endpoint) {
    const key = endpoint ? `${ip}:${endpoint}` : ip;
    const requests = this.recentRequests.get(key) || [];
    
    if (requests.length < 10) return false;

    // Calculate intervals between requests
    const intervals = [];
    for (let i = 1; i < Math.min(requests.length, 50); i++) {
      intervals.push(requests[i].timestamp - requests[i-1].timestamp);
    }

    // Check variance
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Low standard deviation indicates uniform timing
    return stdDev < (avg * 0.1);
  }

  /**
   * Check if IP is hitting multiple endpoints rapidly
   */
  checkMultipleEndpoints(ip) {
    const endpoints = new Set();
    const now = Date.now();
    const recentWindow = now - (60 * 1000); // Last minute

    for (const [key, requests] of this.recentRequests.entries()) {
      if (key.startsWith(ip + ':')) {
        const endpoint = key.split(':')[1];
        const recentRequests = requests.filter(r => r.timestamp > recentWindow);
        
        if (recentRequests.length > 0) {
          endpoints.add(endpoint);
        }
      }
    }

    return endpoints.size > 20; // More than 20 different endpoints in a minute
  }

  /**
   * Check if all requests use same user agent (possible bot)
   */
  checkSingleUserAgent(ip) {
    const userAgents = new Set();
    let totalRequests = 0;

    for (const [key, requests] of this.recentRequests.entries()) {
      if (key.startsWith(ip + ':')) {
        requests.forEach(r => {
          if (r.userAgent) {
            userAgents.add(r.userAgent);
            totalRequests++;
          }
        });
      }
    }

    // If more than 100 requests but only 1 user agent, suspicious
    return totalRequests > 100 && userAgents.size === 1;
  }

  /**
   * Get IP statistics
   */
  getIPStats(ip) {
    const stats = {
      totalRequests: 0,
      endpoints: new Set(),
      userAgents: new Set(),
      requestsPerMinute: 0,
      suspicious: false
    };

    const now = Date.now();
    const oneMinuteAgo = now - (60 * 1000);

    for (const [key, requests] of this.recentRequests.entries()) {
      if (key.startsWith(ip + ':')) {
        const endpoint = key.split(':')[1];
        stats.endpoints.add(endpoint);
        
        requests.forEach(r => {
          stats.totalRequests++;
          
          if (r.userAgent) {
            stats.userAgents.add(r.userAgent);
          }
          
          if (r.timestamp > oneMinuteAgo) {
            stats.requestsPerMinute++;
          }
        });
      }
    }

    // Check if suspicious
    const suspiciousCheck = this.isSuspicious(ip);
    stats.suspicious = suspiciousCheck.suspicious;
    stats.suspiciousReasons = suspiciousCheck.reasons;

    return {
      ...stats,
      endpoints: Array.from(stats.endpoints),
      userAgents: Array.from(stats.userAgents)
    };
  }

  /**
   * Get top IPs by request count
   */
  getTopIPs(limit = 10, windowSeconds = 3600) {
    const ipCounts = new Map();
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);

    for (const [key, requests] of this.recentRequests.entries()) {
      const ip = key.split(':')[0];
      
      const recentRequests = requests.filter(r => r.timestamp > windowStart);
      
      if (!ipCounts.has(ip)) {
        ipCounts.set(ip, 0);
      }
      
      ipCounts.set(ip, ipCounts.get(ip) + recentRequests.length);
    }

    // Sort by count
    const sorted = Array.from(ipCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return sorted.map(([ip, count]) => ({
      ip,
      requests: count,
      rate: count / windowSeconds
    }));
  }

  /**
   * Clear tracking data for IP
   */
  clearIP(ip) {
    for (const key of this.recentRequests.keys()) {
      if (key.startsWith(ip + ':')) {
        this.recentRequests.delete(key);
      }
    }

    logger.info(`[IPTracker] Cleared tracking data for IP: ${ip}`);
  }

  /**
   * Get all tracked IPs
   */
  getAllIPs() {
    const ips = new Set();
    
    for (const key of this.recentRequests.keys()) {
      const ip = key.split(':')[0];
      ips.add(ip);
    }

    return Array.from(ips);
  }

  /**
   * Cleanup old data
   */
  cleanup() {
    const now = Date.now();
    const oneHourAgo = now - (3600 * 1000);
    let cleanedCount = 0;

    for (const [key, requests] of this.recentRequests.entries()) {
      const filtered = requests.filter(r => r.timestamp > oneHourAgo);
      
      if (filtered.length === 0) {
        this.recentRequests.delete(key);
        cleanedCount++;
      } else if (filtered.length !== requests.length) {
        this.recentRequests.set(key, filtered);
      }
    }

    if (cleanedCount > 0) {
      logger.info(`[IPTracker] Cleaned up ${cleanedCount} old entries`);
    }

    return { cleaned: cleanedCount };
  }
}

module.exports = IPTracker;
