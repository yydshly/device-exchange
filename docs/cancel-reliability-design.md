# Transfer cancellation reliability — implementation slice

## Reproduced defect
The former binary payloads carried no transfer identity. A receiver cancelling mid-stream cleared its buffer, but already queued data could then either fail the trusted session or append to a newly accepted transfer. A late end marker also failed after cancellation. Three deterministic before-fix failures are recorded in `cancel-before.json`.

## Implementation
Protocol v2 prefixes each binary frame with a 36-byte transfer UUID and a 4-byte big-endian offset. Payloads remain at most 16 KiB. The receiver checks identity, exact offset and size before appending. A bounded 64-ID retired-transfer set discards late chunks/end markers for cancelled or completed transfers. Receipt release still requires SHA-256 verification. Reusing a retired ID is rejected.

Both endpoints now advertise protocol v2 during explicit trust confirmation. Old cached peers require refresh rather than silently mixing framed/unframed formats. Local close stops its channel and clears its UI before trying the server; failed server close is disclosed and does not pretend the invitation was revoked. Signalling requests have an eight-second client timeout. Disconnect marks the transfer failed and discards partial data; this is fresh-pair/retry, not resumable transfer.

## Verification in progress
Original sixteen protocol tests pass after adapting only their transport fixtures to v2. Nine additional cancellation/identity/offset/version/checksum-boundary checks pass; `cancel-after.json` contains these deterministic mocked-channel results.

`tests/reliability.py` is a separate real-RTC suite for the standard Linux CI runner. It uses native RTC with a labelled application-side pacing window so cancellation occurs after bytes start but before completion. It also injects one pre-send payload corruption, simulates HTTP signalling offline, and closes a peer tab. Those are controlled faults; they are not claims of actual WAN/NAT/iPad testing. The existing unmodified-content byte-exact suite remains required. CI execution result will be recorded separately once terminal.

While GitHub Git/Actions was unavailable on 2026-10-07, independent local checks were extended to cancellation during asynchronous checksum verification and exact frame reassembly at 0, 1, 16,383, 16,384, 16,385 and 26,214,400 bytes. These use the real SHA-256/Blob implementation with a mocked channel and are not represented as browser/network validation.
