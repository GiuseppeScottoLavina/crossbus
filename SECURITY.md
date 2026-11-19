# Security Policy

## Release qualification

| Version | Status |
| ------- | ------ |
| 0.1.2 | Published release; historical checks and limitations are recorded in the audit |
| 0.1.3 | Published release; qualification is recorded in the audit |
| 0.1.4 | Published release; qualification and limitations are recorded in the audit |
| 0.1.5 | Published release; focused browser/device qualification and bounded stream regressions are recorded in the audit |
| 0.1.6 | Published release; affected by the plugin and iOS adapter issues fixed in 0.1.7 (see the audit) |
| 0.1.7 | Published release; affected by the encryption replay issue fixed in 0.1.8 (see the audit). Physical iPad receipts cover 0.1.5 and 0.1.7 |
| 0.1.8 | Release qualification; the review after 0.1.7 and its regression tests are recorded in the audit. Physical-device receipts do not cover 0.1.8 |

See [the audit](docs/AUDIT.md) for measured coverage and outstanding browser/device qualification. A passing suite does not establish that a version has no vulnerabilities.

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do NOT create a public GitHub issue

Security vulnerabilities should be reported privately to avoid exploitation before a fix is available.

### 2. Email the maintainers

Send an email to **giuseppe.sc8.lavina@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### 3. Response and follow-up

Include a way for the maintainer to contact you for reproduction details. This project does not publish a verified response-time or fix-release service guarantee.

## Security Features

CrossBus provides configurable security controls; no independent security rating or certification is claimed.

### Origin Validation
```javascript
// For a MessageChannel binding; use exact application origins for windows.
const bus = CrossBus.createSecure({
  allowedOrigins: ['channel']
});
```

### Three-Way Handshake
The standalone handshake utility implements INIT → ACK → COMPLETE negotiation. `addPeer()` and `addTransport()` do not require that handshake, and it is not cryptographic authentication. Bind peer IDs to trusted transport sources; do not trust peer IDs supplied in message payloads.

### Encryption Plugin
Optional AES-256-GCM payload encryption (key distribution and endpoint authentication are application responsibilities):
```javascript
import { withEncryption, Encryption } from 'crossbus/plugins/encryption';
const key = await Encryption.generateKey();
withEncryption(bus, key);
```

Provision the same key to the other trusted endpoint through your application's key-distribution mechanism. Generating a key independently at each endpoint will not create a shared encrypted channel. `Encryption.deriveKey(password, salt, iterations)` defaults to 100,000 PBKDF2-SHA256 iterations, so that keys match those derived by earlier versions; pass at least 600,000, the OWASP recommendation, for new deployments, and the same value on every endpoint.

Since 0.1.7, `withEncryption()`:

- encrypts every outbound payload, response and RPC error message;
- authenticates the message type, the signal or handler name and, for replies, the request ID as AES-GCM additional data, so ciphertext cannot be moved to another handler or request;
- rejects inbound plaintext (`ERR_ENCRYPTION_REQUIRED`), ciphertext that fails authentication (`ERR_DECRYPTION_FAILED`), messages older than `ttl` (60 s) or dated more than `maxClockSkew` (5 s) ahead (`ERR_MESSAGE_EXPIRED`), and a message already accepted within that window (`ERR_REPLAY_DETECTED`, including a sender's own messages reflected back to it).

Since 0.1.8, each `withEncryption()` installation is a sending session with a random ID, and numbers its messages. The session ID and number are encrypted with the payload. The receiver keeps a window of the last `replayWindow` (4,096) numbers per session, as IPsec and DTLS do, and checks and records a message in one step after authenticating it. Of two copies that arrive together, only one is accepted. A message further behind than the window is refused, and so is a new session when `maxReplaySessions` (1,024) sessions are active (`ERR_REPLAY_CAPACITY`). Messages from 0.1.7 senders carry no number; they are accepted once per initialization vector, in a cache of `maxReplayEntries` (50,000). When that cache is full, their messages are refused (`ERR_REPLAY_CAPACITY`) rather than forgetting an entry that could then be replayed. In 0.1.7 two concurrent copies were both accepted, and a full cache forgot live entries. A session refuses to encrypt more than 2³² messages (`ERR_ENCRYPTION_LIMIT`): with random 96-bit IVs, NIST SP 800-38D bounds one key to 2³² messages, and that bound covers every holder of the key together, so rotate keys before a deployment approaches it.

The plugin uses the global Web Crypto API: browsers, Bun and Node 19+ provide it; Node 18 needs `--experimental-global-webcrypto`. Both endpoints must run 0.1.7 or later; earlier envelopes have no additional data and fail authentication. 0.1.7 and 0.1.8 endpoints interoperate in both directions. `requireEncryption: false` accepts plaintext during a migration and should not stay enabled. Envelope metadata (message type, names, request IDs, timing and sizes) is visible on the wire. A shared key authenticates membership, not an individual peer: any holder can send messages that other holders accept, so use separate keys per peer pair when peers must not impersonate each other.

### Rate Limiting
Limit outbound operations from this bus; this helper is not an inbound or distributed DoS defense:
```javascript
import { withRateLimiter } from 'crossbus/plugins/rate-limiter';
withRateLimiter(bus, { maxRequests: 100, windowMs: 1000 });
```

`limiter.createHook({ throwOnLimit: false })` drops limited messages with `ERR_MESSAGE_DROPPED`. Before 0.1.7 it delivered them with a null payload.

### Compression, schema validation and tracing
The compression hook stops decompressing once the output exceeds `maxDecompressedBytes` (default 1 MiB) and accepts only `gzip`, `deflate` and `deflate-raw`. The schema validator checks `maxItems` before visiting array items and visits only present elements of sparse arrays; Bun's structured clone of a very large sparse array still costs time before any CrossBus code runs. The tracer keeps at most `maxTraces` traces (default `maxSpans`), so remote trace IDs cannot grow memory without bound. A failed version migration rejects the message instead of delivering the unmigrated payload.

## Security Best Practices

1. **Always specify allowed origins** - Never use `'*'` with untrusted iframes
2. **Protect sensitive data** - Use an authenticated transport and application key management if enabling payload encryption
3. **Validate payloads** - Always validate incoming message payloads
4. **Keep dependencies updated** - Run `npm audit` regularly
5. **Use CSP headers** - Configure Content Security Policy

## Acknowledgments

We thank all security researchers who responsibly disclose vulnerabilities.

## Enforcement and boundaries

`createSecure()` requires an explicit nonempty allowlist, rejects wildcard patterns and enables strict mode. Configure transport origin/source checks too. Manually supplied messages require an authenticated channel identity. Responses must come from the requested peer. Inbound/outbound hook errors stop processing; inbound RPC validation failures return an error without running the protected handler.

`maxPendingRequests` bounds in-flight requests. `maxPayloadSize` applies a conservative in-memory estimate (two bytes per UTF-16 code unit, binary byte lengths and per-value overhead), not an exact wire-size guarantee. Zero disables either budget. Per-handler rate limiting is a local fixed window, not a distributed DoS defense. The schema plugin supports selected keywords; it is not a complete JSON Schema implementation.

In 0.1.4, typed-view budgets read native backing storage rather than shadowable public properties. Opt-in automatic transfer moves an eligible view's entire backing ArrayBuffer and detaches all sender aliases. JSON-string transport encoding rejects explicit transfer lists and does not discover automatic transfers. Native structured clone and JSON parsing may allocate before the bus can enforce its budget; this is not a limit on browser-internal allocation.

Browser UUIDs in 0.1.4 consume fresh Web Crypto bytes from a bounded pool; Node/Bun retain native UUID generation. Entropy-provider errors propagate. The older no-Web-Crypto fallback remains noncryptographic. Message and peer IDs are labels, not authentication credentials.

Native adapters restrict origins and main frames, and reject malformed or oversized envelopes. See [native integration and qualification limits](native/README.md). Shared/service worker transport availability does not imply persistent storage or offline delivery. Production deployment, browser compatibility and security should be validated for the application's actual configuration.

The 0.1.5 Swift adapter rejects boolean protocol markers explicitly before accepting numeric `1`; physical-device tests assert malformed/oversized/subframe and wrong-origin messages never execute the protected handler. Its stream manager has queue, reorder, control-message and active-stream budgets. These apply after channel delivery and do not limit browser-internal parsing/cloning allocations or the complete result assembled by `collect()`. Stream routing must be bound to authenticated peers and application authorization; manually dispatched stream utilities do not inherit CrossBus RPC hooks automatically. See [streaming](docs/STREAMING.md) and [qualification receipts](docs/QUALIFICATION.md).
