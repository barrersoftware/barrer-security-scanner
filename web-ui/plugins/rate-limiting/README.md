# Rate Limiting Plugin

**Version:** 1.0.0  
**Category:** Security  
**Priority:** 95 (Critical)

Advanced API rate limiting, DDoS protection, and brute force prevention with token bucket algorithm, automatic blocking, and real-time attack detection.

---

## 📋 Features

### Rate Limiting
- ✅ **Token Bucket Algorithm** - Industry-standard rate limiting
- ✅ **Per-IP Rate Limiting** - Limit requests per IP address
- ✅ **Per-User Rate Limiting** - Limit authenticated user requests
- ✅ **Global Rate Limiting** - System-wide request limits
- ✅ **Burst Allowance** - Allow temporary traffic spikes
- ✅ **Automatic Refill** - Tokens refill over time
- ✅ **Rate Limit Headers** - Standard X-RateLimit-* headers

### DDoS Protection
- ✅ **Real-time Detection** - Detect attacks as they happen
- ✅ **Pattern Analysis** - Identify distributed, concentrated, and botnet attacks
- ✅ **Automatic Mitigation** - Auto-block malicious IPs
- ✅ **Confidence Scoring** - AI-driven attack confidence
- ✅ **Sliding Window** - Accurate rate calculation

### Brute Force Prevention
- ✅ **Login Tracking** - Monitor authentication attempts
- ✅ **Auto-blocking** - Block after failed attempts
- ✅ **Progressive Delays** - Slow down attackers
- ✅ **Account Protection** - Prevent credential stuffing

### IP Management
- ✅ **IP Blocking** - Temporary or permanent blocks
- ✅ **IP Whitelisting** - Exempt trusted IPs
- ✅ **Automatic Expiry** - Time-based block removal
- ✅ **Violation Tracking** - Complete audit trail

---

## 🚀 Quick Start

### Default Configuration

```javascript
{
  "enabled": true,
  "global_limit": 1000,        // 1000 requests
  "global_window": 3600,        // per hour
  "per_ip_limit": 100,          // 100 requests
  "per_ip_window": 60,          // per minute
  "per_user_limit": 1000,       // 1000 requests
  "per_user_window": 3600,      // per hour
  "burst_allowance": 50,        // +50 burst
  "ddos_threshold": 1000,       // 1000 req/min
  "brute_force_attempts": 5,    // 5 failed logins
  "brute_force_window": 300,    // in 5 minutes
  "block_duration": 3600,       // block for 1 hour
  "auto_block_enabled": true
}
```

### Basic Usage

The plugin automatically protects all API routes via middleware. No additional configuration needed!

```javascript
// Automatic rate limiting on all routes
app.get('/api/data', (req, res) => {
  // Rate limiting automatically applied
  // Headers automatically set:
  // X-RateLimit-Limit: 100
  // X-RateLimit-Remaining: 99
  // X-RateLimit-Reset: 2025-10-14T05:00:00Z
  res.json({ data: 'protected' });
});
```

---

## 📊 API Endpoints

### Get Status
```bash
GET /api/rate-limiting/status

Response:
{
  "enabled": true,
  "limits": {
    "global": "1000/3600s",
    "perIP": "100/60s",
    "perUser": "1000/3600s"
  },
  "protection": {
    "ddos": true,
    "bruteForce": true,
    "autoBlock": true
  }
}
```

### Get Configuration
```bash
GET /api/rate-limiting/config

Response: {config object}
```

### Update Configuration
```bash
PUT /api/rate-limiting/config
Content-Type: application/json

{
  "enabled": true,
  "per_ip_limit": 200,
  "per_ip_window": 60
}
```

### Get Violations
```bash
GET /api/rate-limiting/violations?limit=100

Response: [{violation records}]
```

### Get Blocked IPs
```bash
GET /api/rate-limiting/blocked-ips?limit=100

Response: [{blocked IP records}]
```

### Block IP
```bash
POST /api/rate-limiting/block-ip
Content-Type: application/json

{
  "ip": "192.168.1.100",
  "reason": "Suspicious activity",
  "duration": 3600  // seconds (optional)
}
```

### Unblock IP
```bash
POST /api/rate-limiting/unblock-ip
Content-Type: application/json

{
  "ip": "192.168.1.100"
}
```

### Get Whitelist
```bash
GET /api/rate-limiting/whitelist?limit=100

Response: [{whitelisted IPs}]
```

### Add to Whitelist
```bash
POST /api/rate-limiting/whitelist
Content-Type: application/json

{
  "ip": "192.168.1.50",
  "description": "Office IP",
  "duration": null  // null = permanent
}
```

### Remove from Whitelist
```bash
DELETE /api/rate-limiting/whitelist/192.168.1.50
```

### Get Statistics
```bash
GET /api/rate-limiting/stats

Response:
{
  "rateLimits": [{stats by type}],
  "topIPs": [{top IPs}],
  "ddos": [{ddos events}],
  "bruteForce": {brute force stats}
}
```

### Reset Limits
```bash
POST /api/rate-limiting/reset
Content-Type: application/json

{
  "identifier": "192.168.1.100",
  "identifierType": "ip",
  "endpoint": "/api/data"  // optional
}
```

---

## ⚙️ Configuration

### Rate Limits

**Global Limits:**
```javascript
{
  "global_limit": 1000,      // Total requests allowed
  "global_window": 3600      // Time window in seconds
}
```

**Per-IP Limits:**
```javascript
{
  "per_ip_limit": 100,       // Requests per IP
  "per_ip_window": 60,       // Window in seconds
  "burst_allowance": 50      // Extra burst tokens
}
```

**Per-User Limits:**
```javascript
{
  "per_user_limit": 1000,    // Requests per authenticated user
  "per_user_window": 3600    // Window in seconds
}
```

### DDoS Protection

```javascript
{
  "ddos_threshold": 1000,    // Requests per window
  "ddos_window": 60,         // Detection window
  "auto_block_enabled": true // Auto-block attackers
}
```

### Brute Force Protection

```javascript
{
  "brute_force_attempts": 5, // Failed login threshold
  "brute_force_window": 300, // Window in seconds (5 min)
  "block_duration": 3600     // Block duration (1 hour)
}
```

---

## 🔒 Security Features

### Token Bucket Algorithm
Implements industry-standard token bucket for smooth rate limiting:
- Tokens refill at constant rate
- Burst traffic allowed up to limit
- Prevents request spikes
- Fair resource distribution

### DDoS Detection
Multi-pattern attack detection:
- **Distributed:** Many IPs with moderate traffic
- **Concentrated:** Few IPs with very high traffic
- **Botnet:** Automated bot-like patterns
- **Confidence scoring:** 0-100% attack probability

### Attack Patterns
Detects suspicious behavior:
- High frequency requests (>10 req/s)
- Uniform timing (bot-like)
- Multiple endpoint scanning
- Single user-agent patterns

### Automatic Response
Real-time protection:
- Auto-block malicious IPs
- Log all violations
- Notify administrators
- Temporary or permanent blocks

---

## 📈 Monitoring

### Rate Limit Headers

All responses include standard rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2025-10-14T05:00:00.000Z
```

### Violation Logging

All rate limit violations are logged:
- IP address
- Endpoint
- Limit type
- Current rate
- Action taken
- Timestamp

### Statistics

Real-time statistics available:
- Requests per identifier
- Top IPs by traffic
- DDoS events
- Brute force attempts
- Block/whitelist counts

---

## 🎯 Use Cases

### 1. API Protection
Protect your API from abuse:
```javascript
// Automatically protected
app.get('/api/v1/data', handler);
```

### 2. Login Protection
Prevent brute force attacks:
```javascript
// Track login attempts
await bruteForceDetector.trackAttempt(
  tenantId,
  username,
  ipAddress,
  success,
  '/login'
);
```

### 3. DDoS Mitigation
Automatic attack detection:
```javascript
// Runs automatically in middleware
// Blocks attackers in real-time
```

### 4. Trusted IPs
Whitelist your infrastructure:
```javascript
await blockingManager.addToWhitelist(
  tenantId,
  '10.0.0.0/24',
  'Internal network'
);
```

---

## 🧪 Testing

### Test Rate Limiting

```bash
# Send multiple requests
for i in {1..150}; do
  curl http://localhost:3000/api/test
done

# Should see 429 after 100 requests
```

### Test IP Blocking

```bash
# Block an IP
curl -X POST http://localhost:3000/api/rate-limiting/block-ip \
  -H "Content-Type: application/json" \
  -d '{"ip":"192.168.1.100","reason":"test"}'

# Try to access (should get 403)
curl http://localhost:3000/api/test \
  -H "X-Forwarded-For: 192.168.1.100"
```

### Test Brute Force

```bash
# Multiple failed logins
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -d "username=test&password=wrong"
done

# IP should be auto-blocked
```

---

## 📊 Performance

### Efficiency
- **In-memory caching:** Quick IP lookups
- **Minimal DB queries:** Only for persistence
- **Token bucket:** O(1) rate limit checks
- **Cleanup intervals:** Automatic old data removal

### Scalability
- Per-tenant configuration
- Horizontal scaling ready
- Efficient data structures (Map)
- Configurable cache size

### Resource Usage
- Memory: ~10-50 MB (depends on traffic)
- CPU: < 1% for normal traffic
- Database: Minimal writes, efficient reads

---

## 🔧 Troubleshooting

### Issue: False Positives

**Problem:** Legitimate users getting blocked

**Solutions:**
1. Increase rate limits
2. Add to whitelist
3. Adjust burst allowance
4. Check DDoS threshold

### Issue: Too Permissive

**Problem:** Attacks not being blocked

**Solutions:**
1. Decrease rate limits
2. Lower DDoS threshold
3. Enable auto-blocking
4. Reduce brute force attempts

### Issue: Performance Impact

**Problem:** Middleware slowing requests

**Solutions:**
1. Increase cache size
2. Adjust cleanup interval
3. Optimize database queries
4. Use connection pooling

### Issue: IP Detection Wrong

**Problem:** Wrong IP address detected

**Solutions:**
1. Check proxy headers (X-Forwarded-For)
2. Configure trusted proxies
3. Use X-Real-IP header
4. Verify network configuration

---

## 🔄 Integration

### With Auth Plugin
```javascript
// User-based rate limiting
const userId = req.user.id;
await rateLimiter.checkLimit(
  tenantId,
  userId,
  'user'
);
```

### With Notifications Plugin
```javascript
// Alert on DDoS
if (ddosDetected) {
  await notificationPlugin.send({
    type: 'security_alert',
    message: 'DDoS attack detected and mitigated'
  });
}
```

### With Audit Log Plugin
```javascript
// All violations automatically logged
// Integration via audit-log plugin
```

---

## 📝 Database Schema

### Tables Created
1. **rate_limits** - Token bucket state
2. **blocked_ips** - Blocked IP addresses
3. **rate_limit_violations** - Audit trail
4. **ip_whitelist** - Trusted IPs
5. **rate_limit_config** - Per-tenant config

### Automatic Cleanup
- Expired blocks removed hourly
- Old rate limit records cleaned
- Violation logs retained per config

---

## 🎓 Best Practices

### 1. Start Conservative
Begin with lower limits and increase as needed:
```javascript
{
  "per_ip_limit": 50,  // Start low
  "per_ip_window": 60
}
```

### 2. Whitelist Infrastructure
Always whitelist your own systems:
```javascript
// Monitoring systems
// Load balancers
// Internal services
```

### 3. Monitor Violations
Regularly review violation logs for patterns

### 4. Adjust for Traffic
Scale limits with your traffic patterns

### 5. Test Before Production
Test rate limiting in staging environment

---

## 📄 License

MIT License - See LICENSE file

---

## 🤝 Contributing

Contributions welcome! Follow security best practices.

---

## 📞 Support

- Documentation: See docs/
- Issues: GitHub Issues
- Security: security@example.com

---

**Rate Limiting Plugin v1.0.0** - Enterprise-Grade API Protection  
Part of AI Security Scanner Project

**🔒 Security First - Zero Tolerance for Attacks**
