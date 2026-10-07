# 随手传 · Device Bridge Lab

私有演示：[随手传](https://device-bridge-lab.yydshly.chatgpt.site)。此源码仓库已按作者授权公开；演示网站仍需要项目所有者登录。源发布版本：`9d2b709fbbc5084cb6a6c1079e79dcce9e6233ae`。

A private, foreground-only iPad↔computer transfer feasibility prototype, plus transparent presentation/transport alternatives. Version 0.1 is **not** a claim of arbitrary-network or iPad-device validation.

## Run

Node 22+. `npm ci`, `node scripts/setup-local.mjs`, then `npm run db:generate` only after schema changes. Apply checked-in migrations to the local D1 database, then `npm run dev -- --port 5188`. Hosting provisions D1 with binding `DB` and applies Drizzle migrations. See `docs/verification.md` for the exact tested workflow.

## Implemented

- Browser UI, single-use 256-bit invitation, host/guest token separation and 10-minute room expiry
- WebRTC reliable ordered data channel, no STUN/TURN configured
- Both devices compare the 48-bit displayed digest of offer + answer, then explicitly trust
- Consent for each file; no bytes sent before receiver acceptance
- 16 KiB chunks, backpressure, 25 MiB cap, SHA-256 receiver integrity and acknowledgement
- Reject/cancel/disconnect states; manual download/copy, no received-file execution
- Responsive Chinese UI, architecture comparison and honest verification boundaries

## Privacy and limits

The server stores signalling SDP, room IDs and token hashes, not files. SDP may contain connection metadata. Expired rooms cannot be read; they are physically deleted on a later API request, not by a timer guarantee. Tokens live in browser memory; the invitation is in the URL fragment. The host must verify the pairing digest on its own second device. This does not protect against a compromised browser, malicious site operator, or a user approving the wrong device.

Private Site access requires the owner to be signed in on both devices; a QR code does not bypass that access control. No cloud file storage, TURN billing, native installation, remote execution, resume, offline pickup or background guarantee is included. Tab memory is used for file assembly and checksum, so 25 MiB is a deliberate product cap.

## Verification

`npx tsc --noEmit`; `npm run lint`; `npm run build`.

`python tests/e2e.py` runs two independent Chromium browser contexts against the local server using synthetic data only. It validates bytes/checksums and consent, not merely status text. No user's personal file was opened or uploaded. Test artifacts and limitations are in `docs/` and `public/verification.json`.

## Roadmap gating

Run actual iPad Safari + computer tests on the user's chosen network before calling the product suitable for daily use. Compare encrypted HTTPS relay if cross-network success is insufficient; compare native/hybrid only if background, system share, or capability execution is important enough to justify installation. Native/hybrid and relay are proposals, not shipped features.

## 2026-10-07 protocol reliability update

Five reproduced protocol races were repaired. Run `node tests/protocol.mjs` and `node tests/protocol-races.mjs` for the nine original plus seven added deterministic checks. These use mocked channels and do not establish real WebRTC or iPad transfer success. See the checked-in before/after regression records.
