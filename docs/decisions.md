# Decision log — 2026-10-06

## D01: Separate delivery surface from transport
User asked to compare both. Browser, native and hybrid are different installation and permission models; WebRTC, HTTPS relay and LAN protocols are separate network choices. No final architecture claim is justified yet.

## D02: Implement a bounded browser direct-transfer slice
Why: no installation and no user-file cloud upload required, executable within current authorized cloud environment. Private Site + D1 signalling, no app-owned credential setup. A real working slice provides better evidence than a visual mockup alone.
Cost: no TURN means restricted networks can fail; no STUN reduces cross-network reachability further. No reliability or performance claims on iPad until hardware tests occur.
Alternative kept open: end-to-end encrypted HTTPS relay with explicit retention and costs; native / optional desktop helper for system actions.

## D03: Safety boundaries
Single-use high-entropy invitation, both endpoints confirm SDP-derived code, receiver accepts each file, 25 MiB cap, hash before releasing a manual download, no auto-open or execution. Private hosting is deliberately retained; no public repository or sharing change assumed.

## D04: Scope of proof
Cloud Chromium contexts exercise real signalling and RTCDataChannel bytes. They do not prove separate hardware, NAT traversal, physical iPad compatibility, lock-screen recovery or production network reachability. Those remain explicit gaps, not fabricated pass results.
