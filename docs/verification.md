# Verification — v0.1

## Passed before hosted browser QA
- TypeScript (`npx tsc --noEmit`)
- Production Worker build (`npm run build`)
- ESLint: zero errors; one advisory for client-generated QR `<img>` (intentionally not remotely optimized)
- Nine protocol unit tests, mock channels: see protocol-results.json
- Ten real local Worker + D1 API tests: see api-results.json

## Browser status
Local Chromium launch was blocked by the execution environment's socket permissions, including the supported elevated retry. This is an environment failure, not a passed browser test. The complete reproducible two-context script remains in tests/e2e.py. Hosted cloud-browser QA is the next supported path.

No physical iPad, separate-machine, different-network, lock-screen, background, resumed-transfer, TURN or native-client result is claimed.

## Reproduce
1. `npm ci`, then `node scripts/setup-local.mjs` (creates the non-secret local D1 binding manifest)
2. `npm run build`
3. `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_aromatic_gunslinger.sql`
4. `npm start -- --port 5188`
5. `DEVICE_TEST_URL=http://127.0.0.1:5188 python tests/api.py`
6. `DEVICE_TEST_URL=http://127.0.0.1:5188 python tests/e2e.py` (requires working Chromium + Python Playwright)
7. `node tests/protocol.mjs`

Tests use generated text, a one-pixel PNG, deterministic binary data, and an empty file only.

## Hosted browser check
Private Site successfully deployed at https://device-bridge-lab.yydshly.chatgpt.site . Supported cloud browser reached its owner sign-in gate. No sign-in was attempted without authorization. Consequently hosted pairing and real WebRTC byte transfer remain **unverified**. The UI and machine report prominently preserve this fact.

## Minimal hardware acceptance check
On the iPad and computer, open the private Site with the owner account, create an invitation on one and scan/join on the other, compare the displayed code, confirm on both, send a synthetic text or image, consent on the receiving device, save and compare SHA-256. Repeat in reverse, reject a file and cancel a pending transfer. Keep both pages in the foreground. This has not yet been performed.

## 2026-10-07 protocol repair
Five race conditions were reproduced and repaired. Seven added regression tests pass in addition to the original nine protocol tests. Before/after evidence is checked in. Type checking passes; lint has zero errors and the existing QR-image performance advisory. No mocked-channel result is claimed as real RTC transfer. The authorized login reached a correct-account basic-profile consent panel; that separate consent is pending.

## 2026-10-07 04:52 UTC: controlled real RTC pass
The former browser execution blocker was resolved using a standard GitHub-hosted runner after the source repository became public. Twelve controlled E2E checks passed; four downloaded synthetic payloads match byte-for-byte and by independent SHA-256. See `rtc-e2e-2026-10-07.md` and `e2e-results.json` for evidence and boundaries. This updates the earlier local-browser-blocked status but does not claim hardware or live private Site validation.
