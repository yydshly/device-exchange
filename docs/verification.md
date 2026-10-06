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
