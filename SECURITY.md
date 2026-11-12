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

CrossBus provides configurable security controls; no independent security rating or certification is claimed.

### Origin Validation
```javascript
const bus = new CrossBus({
  allowedOrigins: ['https://trusted.com', '*.myapp.com']
});
```

### Three-Way Handshake
The standalone handshake utility implements INIT → ACK → COMPLETE negotiation. `addPeer()` and `addTransport()` do not require that handshake, and it is not cryptographic authentication. Bind peer IDs to trusted transport sources; do not trust peer IDs supplied in message payloads.

### Encryption Plugin
Optional AES-256-GCM payload encryption (key distribution and endpoint authentication are application responsibilities):
```javascript
import { withEncryption, Encryption } from 'crossbus/plugins/encryption';
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

## Enforcement and boundaries

`createSecure()` requires an explicit nonempty allowlist, rejects wildcard patterns and enables strict mode. Configure transport origin/source checks too. Manually supplied messages require an authenticated channel identity. Responses must come from the requested peer. Inbound/outbound hook errors stop processing; inbound RPC validation failures return an error without running the protected handler.

`maxPendingRequests` bounds in-flight requests. `maxPayloadSize` applies a conservative in-memory estimate (two bytes per UTF-16 code unit, binary byte lengths and per-value overhead), not an exact wire-size guarantee. Zero disables either budget. Per-handler rate limiting is a local fixed window, not a distributed DoS defense. The schema plugin supports selected keywords; it is not a complete JSON Schema implementation.

Native adapters restrict origins and main frames, and reject malformed or oversized envelopes. See [native integration and qualification limits](native/README.md). Shared/service worker transport availability does not imply persistent storage or offline delivery. Production deployment, browser compatibility and security should be validated for the application's actual configuration.
