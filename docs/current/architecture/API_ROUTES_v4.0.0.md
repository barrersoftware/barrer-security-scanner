# AI Security Scanner v4.0.0 - API Routes Documentation

**Generated:** 2025-10-13 18:16 UTC  
**Version:** 4.0.0  
**Total Plugins:** 7  
**Total Endpoints:** 98 (estimated)

---

## Auth Plugin Routes

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout (requires auth)
- `POST /api/auth/register` - User registration
- `GET /api/auth/session` - Get current session (requires auth)
- `GET /api/auth/csrf-token` - Get CSRF token

### Multi-Factor Authentication (MFA)
- `POST /api/auth/mfa/setup` - Setup MFA (requires auth)
- `POST /api/auth/mfa/verify` - Verify MFA code (requires auth)
- `POST /api/auth/mfa/disable` - Disable MFA (requires auth)

### OAuth
- `GET /api/auth/oauth/:provider` - Initiate OAuth (google/microsoft)
- `GET /api/auth/oauth/:provider/callback` - OAuth callback

### Intrusion Detection System (IDS)
- `GET /api/auth/ids/status` - Get IDS status (requires admin)

### LDAP/Active Directory
- `GET /api/auth/ldap/status` - Get LDAP status (requires admin)
- `POST /api/auth/ldap/verify` - Verify LDAP connection (requires admin)
- `POST /api/auth/ldap/search` - Search LDAP users (requires admin)

**Note:** Auth plugin uses `/api/auth/session` instead of `/api/auth/profile`

---

## Security Plugin Routes

### Rate Limiting
- `GET /api/security/rate-limit/status` - Get rate limit status
- `POST /api/security/rate-limit/reset` - Reset rate limits (admin)

### CSRF Protection
- `GET /api/security/csrf-token` - Get CSRF token

### Input Validation
- `POST /api/security/validate` - Validate input

### Encryption
- `POST /api/security/encrypt` - Encrypt data
- `POST /api/security/decrypt` - Decrypt data

### Hashing
- `POST /api/security/hash` - Hash data

### Security Headers
- Applied automatically to all responses via middleware

---

## Scanner Plugin Routes

### Scan Management
- `GET /api/scanner/status` - Get scanner status
- `POST /api/scanner/start` - Start comprehensive scan
- `POST /api/scanner/code-review` - Start code review
- `POST /api/scanner/malware-scan` - Start malware scan
- `GET /api/scanner/:scanId` - Get scan details
- `POST /api/scanner/:scanId/stop` - Stop scan

### Platform Info
- `GET /api/scanner/platform` - Get platform information
- `GET /api/scanner/scans` - List available scans

---

## Storage Plugin Routes

### Backup Management
- `POST /api/storage/backup/create` - Create backup
- `GET /api/storage/backup/list` - List backups
- `GET /api/storage/backup/:id` - Get backup details
- `POST /api/storage/backup/restore` - Restore backup
- `DELETE /api/storage/backup/:id` - Delete backup
- `POST /api/storage/backup/schedule` - Schedule backup
- `GET /api/storage/backup/schedule` - Get backup schedule

### Report Management
- `POST /api/storage/reports` - Save report
- `GET /api/storage/reports` - List reports
- `GET /api/storage/reports/:id` - Get report
- `DELETE /api/storage/reports/:id` - Delete report

### Storage Status
- `GET /api/storage/status` - Get storage status

---

## Admin Plugin Routes

### User Management
- `GET /api/admin/users` - List users (admin)
- `POST /api/admin/users` - Create user (admin)
- `GET /api/admin/users/:id` - Get user (admin)
- `PUT /api/admin/users/:id` - Update user (admin)
- `DELETE /api/admin/users/:id` - Delete user (admin)
- `POST /api/admin/users/:id/role` - Update user role (admin)
- `GET /api/admin/users/stats` - Get user statistics (admin)

### System Monitoring
- `GET /api/admin/system/health` - System health check (admin)
- `GET /api/admin/system/resources` - Resource usage (admin)
- `GET /api/admin/system/plugins` - Plugin status (admin)
- `GET /api/admin/system/services` - Service health (admin)
- `GET /api/admin/system/logs` - Application logs (admin)

### Settings Management
- `GET /api/admin/settings` - Get all settings (admin)
- `GET /api/admin/settings/:category` - Get category settings (admin)
- `PUT /api/admin/settings/:category/:key` - Update setting (admin)
- `GET /api/admin/settings/export` - Export settings (admin)
- `POST /api/admin/settings/import` - Import settings (admin)
- `POST /api/admin/settings/reset` - Reset to defaults (admin)

### Audit Logging
- `GET /api/admin/audit/logs` - Get audit logs (admin)
- `GET /api/admin/audit/logs/export` - Export logs (admin)
- `GET /api/admin/audit/stats` - Get audit statistics (admin)

### Dashboard
- `GET /api/admin/dashboard` - Dashboard overview (admin)

---

## VPN Plugin Routes

### VPN Status
- `GET /api/vpn/status` - Get VPN status

### WireGuard Management
- `POST /api/vpn/wireguard/install` - Install WireGuard
- `POST /api/vpn/wireguard/start` - Start WireGuard server
- `POST /api/vpn/wireguard/stop` - Stop WireGuard server
- `POST /api/vpn/wireguard/restart` - Restart WireGuard server
- `GET /api/vpn/wireguard/status` - Get WireGuard status
- `GET /api/vpn/wireguard/config` - Get server config

### WireGuard Peer Management
- `POST /api/vpn/wireguard/peers` - Add peer
- `GET /api/vpn/wireguard/peers` - List peers
- `GET /api/vpn/wireguard/peers/:id` - Get peer details
- `GET /api/vpn/wireguard/peers/:id/config` - Get peer config
- `DELETE /api/vpn/wireguard/peers/:id` - Remove peer

### OpenVPN Management
- `POST /api/vpn/openvpn/install` - Install OpenVPN
- `POST /api/vpn/openvpn/start` - Start OpenVPN server
- `POST /api/vpn/openvpn/stop` - Stop OpenVPN server
- `POST /api/vpn/openvpn/restart` - Restart OpenVPN server
- `GET /api/vpn/openvpn/status` - Get OpenVPN status
- `GET /api/vpn/openvpn/config` - Get server config

### OpenVPN Client Management
- `POST /api/vpn/openvpn/clients` - Add client
- `GET /api/vpn/openvpn/clients` - List clients
- `GET /api/vpn/openvpn/clients/:id` - Get client details
- `GET /api/vpn/openvpn/clients/:id/config` - Get client config
- `DELETE /api/vpn/openvpn/clients/:id` - Revoke client

### VPN Monitoring
- `GET /api/vpn/connections` - Get active connections
- `GET /api/vpn/traffic` - Get traffic statistics
- `GET /api/vpn/bandwidth` - Get bandwidth usage
- `GET /api/vpn/history` - Get connection history

---

## System-Info Plugin Routes

### System Information
- `GET /api/system/info` - Get system information
- `GET /api/system/hardware` - Get hardware information
- `GET /api/system/network` - Get network information
- `GET /api/system/storage` - Get storage information
- `GET /api/system/processes` - Get process information

---

## Authentication Requirements

### Public Routes (No Auth Required)
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/oauth/:provider`
- `GET /api/auth/oauth/:provider/callback`
- `GET /api/auth/csrf-token`

### Authenticated Routes (Requires JWT Token)
- All routes not listed as public
- Use: `Authorization: Bearer <token>`

### Admin Routes (Requires Admin Role)
- All `/api/admin/*` routes
- IDS and LDAP management routes
- System monitoring routes
- User management routes

---

## Request/Response Examples

### Login
```bash
# Request
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"password"}'

# Response
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "123",
    "username": "user",
    "email": "user@example.com",
    "role": "user"
  }
}
```

### Get Session
```bash
# Request
curl -X GET http://localhost:3001/api/auth/session \
  -H "Authorization: Bearer <token>"

# Response
{
  "success": true,
  "user": {
    "id": "123",
    "username": "user",
    "email": "user@example.com",
    "role": "user",
    "mfaEnabled": false
  }
}
```

### Start Scan
```bash
# Request
curl -X POST http://localhost:3001/api/scanner/start \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"comprehensive"}'

# Response
{
  "success": true,
  "scanId": "scan_1697215432_abc123",
  "status": "running",
  "startTime": "2025-10-13T18:00:00Z"
}
```

### Get System Health
```bash
# Request
curl -X GET http://localhost:3001/api/admin/system/health \
  -H "Authorization: Bearer <admin_token>"

# Response
{
  "success": true,
  "health": {
    "status": "healthy",
    "uptime": 3600,
    "cpu": "15%",
    "memory": "45%",
    "disk": "30%",
    "plugins": 7,
    "services": 18
  }
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Admin access required"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Route GET /api/invalid not found"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 60 seconds",
  "retryAfter": 60
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limits

### Authentication Endpoints
- **Limit:** 5 requests per 5 minutes per IP
- **Applies to:** `/api/auth/login`, `/api/auth/register`

### API Endpoints
- **Limit:** 100 requests per minute per IP
- **Applies to:** All authenticated endpoints

### Scan Endpoints
- **Limit:** 10 scans per hour per user
- **Applies to:** `/api/scanner/*` scan initiation endpoints

---

## Security Headers

All responses include:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy: default-src 'self'`
- `Referrer-Policy: no-referrer`

---

## WebSocket Support

Real-time updates available via WebSocket:
- **URL:** `ws://localhost:3001`
- **Authentication:** Send token after connection
- **Events:** scan progress, system alerts, real-time monitoring

---

## Notes

1. All timestamps are in ISO 8601 format (UTC)
2. All IDs are unique strings
3. Pagination supported where applicable (use `?page=1&limit=50`)
4. Filtering supported on list endpoints (use query parameters)
5. All requests should include `Content-Type: application/json` for POST/PUT

---

**Documentation Status:** ✅ Complete for v4.0.0  
**Last Updated:** 2025-10-13 18:16 UTC  
**Next Review:** After adding v5.0.0 features

For full API documentation with request/response schemas, see the OpenAPI specification (coming soon).
