# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do NOT create a public GitHub issue

Security vulnerabilities should be reported privately to avoid exploitation before a fix is available.

### 2. Email the maintainers

Send an email to **giuseppe.sc8.lavina@gmail.com** (or open a private security advisory on GitHub) with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### 3. Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix release**: Typically within 30 days (depending on severity)

## Security Features

CrossBus includes several security features by default:

### Origin Validation
```javascript
const bus = new CrossBus({
  allowedOrigins: ['https://trusted.com', '*.myapp.com']
});
```

### Three-Way Handshake
All peer connections require mutual authentication via INIT → ACK → COMPLETE protocol.

### Encryption Plugin
Optional AES-256-GCM end-to-end encryption:
```javascript
import { withEncryption } from 'crossbus/plugins/encryption';
const key = await Encryption.deriveKey('password', 'salt');
withEncryption(bus, key);
```

### Rate Limiting
Prevent DoS attacks:
```javascript
import { withRateLimiter } from 'crossbus/plugins/rate-limiter';
withRateLimiter(bus, { maxRequests: 100, windowMs: 1000 });
```

## Security Best Practices

1. **Always specify allowed origins** - Never use `'*'` with untrusted iframes
2. **Use encryption for sensitive data** - Enable the encryption plugin
3. **Validate payloads** - Always validate incoming message payloads
4. **Keep dependencies updated** - Run `npm audit` regularly
5. **Use CSP headers** - Configure Content Security Policy

## Acknowledgments

We thank all security researchers who responsibly disclose vulnerabilities.
