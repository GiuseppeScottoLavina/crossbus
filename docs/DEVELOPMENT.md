# CrossBus Development Rules

> ⚠️ **MANDATORY** - These rules must NEVER be violated.

---

## 🔴 Rule 1: Test-Driven Development (TDD)

**Write tests FIRST, then implement.**

```
1. Write failing test that defines expected behavior
2. Run test → verify it fails
3. Implement minimal code to pass
4. Run test → verify it passes
5. Refactor if needed
6. Repeat
```

❌ **NEVER** write implementation before tests.

---

## 🔴 Rule 2: No Breaking Changes

**Every change must be validated by ALL tests.**

```bash
# Before ANY commit
npm test         # All tests must pass
npm run lint     # No lint errors
```

❌ **NEVER** commit code that breaks existing tests.

---

## 🔴 Rule 3: Documentation Sync

**Every change must update relevant documentation.**

| Changed | Must Update |
|---------|-------------|
| Public API | `docs/API.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Types/Enums | JSDoc in source |
| New feature | Add to `README.md` |
| Native | `docs/native/*.md` |

❌ **NEVER** merge undocumented changes.

---

## 🔴 Rule 4: Interface Changes Require Discussion

**Any modification to public API must be discussed and approved.**

Requires discussion:
- New public methods
- Changed method signatures
- New error codes
- Protocol changes
- Config options

Process:
1. Propose change with rationale
2. Discuss implications
3. Update docs with proposed change
4. Get approval
5. Implement with TDD

❌ **NEVER** change public interfaces unilaterally.

---

## 🔴 Rule 5: Quality Over Speed

**Maximum quality is the goal, NOT development speed.**

- Take time to design properly
- Write comprehensive tests
- Document thoroughly
- Review carefully
- Refactor when needed

❌ **NEVER** sacrifice quality for speed.

---

## 🔴 Rule 6: Well-Commented Code

**Code must be thoroughly commented for readability.**

- Every public function: JSDoc with `@param`, `@returns`, `@throws`, `@example`
- Every class: JSDoc with purpose and usage
- Complex logic: Inline comments explaining WHY
- Non-obvious decisions: Comment the rationale
- Magic numbers: Named constants with comments

```javascript
// ✅ GOOD
/**
 * Calculates exponential backoff delay with jitter.
 * 
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {number} baseDelay - Base delay in ms
 * @returns {number} Delay in ms with random jitter
 */
function getBackoffDelay(attempt, baseDelay) {
  // Exponential: 1s, 2s, 4s, 8s...
  const exponential = baseDelay * Math.pow(2, attempt);
  
  // Add 10% jitter to prevent thundering herd
  const jitter = exponential * 0.1 * Math.random();
  
  return exponential + jitter;
}

// ❌ BAD
function getDelay(a, b) {
  return b * Math.pow(2, a) * (1 + 0.1 * Math.random());
}
```

❌ **NEVER** write uncommented complex code.

```
□ Tests written FIRST
□ All tests passing
□ Docs updated
□ Interface changes discussed (if any)
□ Code reviewed for quality
```

---

## Platform qualification

Target modern browser engines and keep runtime dependencies optional. The package declares Node >=18, but the locally tested versions and remaining compatibility work are recorded in [AUDIT.md](AUDIT.md). Browser/native API availability varies by transport. Do not list a browser or mobile OS version as qualified from a build check alone. Native compiler targets, installed WebView capabilities and physical runtime qualification are separate facts.
