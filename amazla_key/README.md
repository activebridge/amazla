# Amazla - Tesla Watch App

ZeppOS app for controlling Tesla vehicles from Amazfit smartwatches.

## Features

- **BLE Direct Control** - Bluetooth control without internet, fully standalone
- **Lock / Unlock / Trunk / Frunk** - HMAC-signed RKE commands; **device-confirmed actuating the vehicle (2026-06-02)**
- **Passive Entry & Keyless Drive** - walk up → unlock → drive → walk away → auto-lock, with **no command** (the car unlocks/authorizes from its own ranging once the watch is a present key); **device-validated full drive cycle (2026-06-09)**, while the app is open + connected — see [Passive Entry & Keyless Drive](#passive-entry--keyless-drive)
- **Drive (Remote Start)** - `RKE_ACTION_REMOTE_DRIVE`; explicit command-path "shift to Drive", **device-confirmed (2026-06-04)**. Now largely superseded by passive keyless drive above.
- **Vehicle Status** - Door/closure states, lock state, sleep status
- **Offline session** - The session key (derived once via phone ECDH) is cached on the watch, so session establishment needs no phone after pairing

> **Status (2026-06-09):** Pairing, session, lock/unlock/trunk/frunk, **and passive entry + keyless drive** are working end-to-end on real hardware. Passive entry reverses an earlier "not achievable" verdict — see [Passive Entry & Keyless Drive](#passive-entry--keyless-drive). Getting commands to actuate required six fixes to the command/response path — see [Command path fixes](#command-path-fixes-2026-06-02).

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM ARCHITECTURE                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────────────┐    │
│   │             │   BLE   │             │   BLE   │                     │    │
│   │    Watch    │◄───────►│    Phone    │         │       Tesla         │    │
│   │  (ZeppOS)   │  Sync   │  (Android)  │         │     (Vehicle)       │    │
│   │             │         │             │         │                     │    │
│   └──────┬──────┘         └─────────────┘         └──────────┬──────────┘    │
│          │                                                   │               │
│          │              Direct BLE Connection                │               │
│          └───────────────────────────────────────────────────┘               │
│                                                                              │
│   Phone needed ONLY at PAIRING:   Watch handles (standalone use):            │
│   • Initial key generation        • BLE communication                        │
│   • BigInt P-256 ECDH →           • Session establishment (cached key,       │
│     32-byte shared secret           NO ECDH on watch)                        │
│     (once per vehicle pubkey)     • Commands (HMAC signing)                  │
│                                   • Stores pubkey + EC key + sessionKey+VIN  │
│                                                                              │
│   After pairing the watch operates with NO phone — it reuses the cached      │
│   16-byte session key. No doublings table is stored or transferred.          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Key Management

### Two Types of Keys

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              KEY MANAGEMENT                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. ENROLLED KEY (Long-term identity)                                        │
│  ════════════════════════════════════                                        │
│                                                                              │
│     ┌─────────────────────────────────────────────────────────────────┐      │
│     │  Watch                                                          │      │
│     │  ┌─────────────────────────────────────────────────────────────┐│      │
│     │  │ watchPublicKey:  65-byte binary string (LocalStorage)       ││      │
│     │  └─────────────────────────────────────────────────────────────┘│      │
│     │  Phone holds the enrolled keypair (settingsStorage); does ECDH  │      │
│     └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│     • Generated by phone app (ble-crypto.js)                                 │
│     • Only the PUBLIC key is synced to the watch; private stays on phone     │
│     • Public key added to car's whitelist during pairing; identifies the     │
│       watch in SessionInfoRequest                                            │
│     • The watch holds NO private key — it has no use for one (no             │
│       BigInt in QuickJS; the phone does the ECDH, see 2). The                │
│       enrolled private key never leaves the phone.                           │
│                                                                              │
│  2. CACHED SESSION KEY (replaces the old "doublings table")                  │
│  ════════════════════════════════════════════════════════                    │
│                                                                              │
│     ┌─────────────────────────────────────────────────────────────────┐      │
│     │  session_key.dat (16 B)  +  vehicle_ec_public_key.dat (65 B)    │      │
│     │  sessionKey = sha1( ECDH(enrolledPriv, vehiclePub) )[:16]       │      │
│     └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│     • Vehicle EC pubkey comes from SessionInfo on the first connect          │
│     • The PHONE computes the ECDH (BLE_COMPUTE_SHARED_SECRET) and returns    │
│       the 32-byte shared secret; watch does sha1()[:16] and caches it        │
│     • Constant per watch+vehicle → reused every connect: no phone, no ECDH   │
│     • Re-derived only if the vehicle EC key changes (= a re-pair event)      │
│     • The 16 KB doublings table is gone — never stored or transferred        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

> **Removed: the ephemeral key pool.** Earlier versions synced a pool of P-256
> keypairs from the phone (`BLE_SYNC_POOL`) and consumed one per session, because
> the original design used an ephemeral key per ECDH handshake. After the long-term
> enrolled-key refactor (Go SDK `Session.localKey` parity) session + ECDH use the
> **single long-term keypair**, so the pool became dead weight — it was never
> consumed (`popKey` had no callers) and only gated `isPaired`. It has been removed
> entirely (2026-06-02); the watch no longer syncs, stores, or displays a pool.

## Pairing Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              PAIRING FLOW                                    │
│                    (One-time setup to add watch as key)                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    Phone              Watch                Tesla                User         │
│      │                  │                    │                    │          │
│      │                  │ ◄─── taps PAIR ────┼────────────────────┤          │
│      │ ◄── pairSetup ── │                    │                    │          │
│   ┌──┴──────┐           │                    │                    │          │
│   │Generate │           │                    │                    │          │
│   │watch    │           │                    │                    │          │
│   │keypair  │           │                    │                    │          │
│   │Build    │           │                    │                    │          │
│   │pair +   │           │                    │                    │          │
│   │verify   │           │                    │                    │          │
│   │messages │           │                    │                    │          │
│   └──┬──────┘           │                    │                    │          │
│      │ ── pairMsg,  ──► │                    │                    │          │
│      │    verifyMsg     │                    │                    │          │
│      │                  │ ◄── BLE adv ────── │                    │          │
│      │                  │   Name:"S{vin}C"   │                    │          │
│      │                  │ ─── connect ─────► │                    │          │
│      │                  │                    │                    │          │
│      │                  │ ─── pairMsg ─────► │                    │          │
│      │                  │  (WhitelistOp +    │                    │          │
│      │                  │   watch pubkey +   │                    │          │
│      │                  │   KeyMetadata      │                    │          │
│      │                  │   ANDROID_DEVICE)  │                    │          │
│      │                  │ ◄── STATUS_WAIT ── │                    │          │
│      │                  │ "Waiting keycard"  │                    │          │
│      │               ┌──┴───┐                │                    │          │
│      │               │Show  │                │                    │          │
│      │               │"Tap  │                │                    │          │
│      │               │card" │                │                    │          │
│      │               └──┬───┘                │                    │          │
│      │                  │                    │ ◄── NFC tap ────── │          │
│      │                  │ ◄── STATUS_OK ──── │                    │          │
│      │                  │   "Key added"      │                    │          │
│      │                  │ ─── verifyMsg ───► │                    │          │
│      │                  │   (whitelist query)│                    │          │
│      │                  │ ◄── WhitelistInfo ─│                    │          │
│      │                  │  (acks pairing —   │                    │          │
│      │                  │   does NOT carry   │                    │          │
│      │                  │   vehicle EC key)  │                    │          │
│      │ ◄ completePair ─ │                    │                    │          │
│      │   (no-op)        │                    │                    │          │
│      │ ── {success} ──► │                    │                    │          │
│      │                  │                    │                    │          │
│      │       ─── First SessionInfoRequest (fires automatically) ───          │
│      │                  │ ── SessionInfoReq ►│                    │          │
│      │                  │   (watch pubkey)   │                    │          │
│      │                  │ ◄── SessionInfo ── │                    │          │
│      │                  │  {VEHICLE EC KEY,  │                    │          │
│      │                  │   epoch, counter,  │                    │          │
│      │                  │   HMAC tag}        │                    │          │
│      │ ◄ computeSecret ─│                    │                    │          │
│      │   (vehicle pub)  │                    │                    │          │
│   ┌──┴──────┐           │                    │                    │          │
│   │BigInt   │           │                    │                    │          │
│   │P-256    │           │                    │                    │          │
│   │ECDH →   │           │                    │                    │          │
│   │32-byte  │           │                    │                    │          │
│   │secret   │           │                    │                    │          │
│   └──┬──────┘           │                    │                    │          │
│      │ ─ shared secret► │                    │                    │          │
│      │               ┌──┴───┐                │                    │          │
│      │               │sha1  │                │                    │          │
│      │               │[:16] │                │                    │          │
│      │               │Save  │                │                    │          │
│      │               │EC,key│                │                    │          │
│      │               └──┬───┘                │                    │          │
│      │                  │                    │                    │          │
│      ▼                  ▼                    ▼                    ▼          │
│   Paired + session key cached. Watch is now standalone — no phone needed.    │
│   (If the post-pair derivation fails, it retries on the next CONNECT)        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Session Establishment Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        SESSION ESTABLISHMENT FLOW                            │
│              (Required before sending commands / passive entry)              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      Watch                                              Tesla                │
│        │                                                  │                  │
│   ┌────┴────┐                                             │                  │
│   │ Load    │                                             │                  │
│   │ long-   │                                             │                  │
│   │ term    │                                             │                  │
│   │ keypair │                                             │                  │
│   └────┬────┘                                             │                  │
│        │                                                  │                  │
│        │  ─── SessionInfoRequest ──────────────────────►  │                  │
│        │      { watch_public_key } ← enrolled long-term   │                  │
│        │                                                  │                  │
│        │  ◄── Intermediate Ack ─────────────────────────  │                  │
│        │      (routing info only, no SessionInfo yet)     │                  │
│        │                                                  │                  │
│        │  ◄── SessionInfo ─────────────────────────────   │                  │
│        │      { vehicle_public_key,                       │                  │
│        │        epoch, counter, clock_time }              │                  │
│        │                                                  │                  │
│   ┌────┴────────────────────────────┐                     │                  │
│   │ Session key (cached; phone ECDH)│                     │                  │
│   │                                 │                     │                  │
│   │ stored EC == vehicle pubkey?    │                     │                  │
│   │   yes → reuse cached session_key│                     │                  │
│   │   no  → phone computes ECDH,    │                     │                  │
│   │         returns shared_secret   │                     │                  │
│   │                                 │                     │                  │
│   │ session_key = SHA1(secret)[:16] │                     │                  │
│   │ cached → reused every connect   │                     │                  │
│   │ (watch runs NO ECDH itself)     │                     │                  │
│   │                                 │                     │                  │
│   │ Verify SessionInfo HMAC tag:    │                     │                  │
│   │ subKey = HMAC(session_key,      │                     │                  │
│   │   "session info")               │                     │                  │
│   │ expected = HMAC(subKey,         │                     │                  │
│   │   TLV(sigType, VIN, uuid)||info)│                     │                  │
│   │ reject on mismatch              │                     │                  │
│   └────┬────────────────────────────┘                     │                  │
│        │                                                  │                  │
│        │  Session established!                            │                  │
│        │  • session_key for HMAC signing                  │                  │
│        │  • epoch, counter for replay protection          │                  │
│        │                                                  │                  │
│        ▼                                                  ▼                  │
│   Ready for commands and passive entry!                                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Command Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              COMMAND FLOW                                    │
│                      (Lock, Unlock, Trunk, Frunk)                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      Watch                                              Tesla                │
│        │                                                  │                  │
│   ┌────┴────────────────────────────┐                     │                  │
│   │ Build Authenticated Command     │                     │                  │
│   │                                 │                     │                  │
│   │ payload = UnsignedMessage{      │                     │                  │
│   │   RKE_ACTION: UNLOCK  (field 2) │                     │                  │
│   │ }                               │                     │                  │
│   │ // BARE UnsignedMessage — NOT   │                     │                  │
│   │ // wrapped in ToVCSEC/Signed-   │                     │                  │
│   │ // Message (Tesla SDK parity)   │                     │                  │
│   │                                 │                     │                  │
│   │ signature_data = {              │                     │                  │
│   │   public_key: eph_pub,          │                     │                  │
│   │   signature_type:               │                     │                  │
│   │     HMAC_PERSONALIZED,          │                     │                  │
│   │   counter: ++counter,           │                     │                  │
│   │   epoch: epoch,                 │                     │                  │
│   │   expires_at: clock + 60s,      │                     │                  │
│   │   tag: HMAC-SHA256(             │                     │                  │
│   │     subKey, metadata||payload)  │                     │                  │
│   │ }                               │                     │                  │
│   │ // subKey = HMAC(session_key,   │                     │                  │
│   │ //   "authenticated command")   │                     │                  │
│   └────┬────────────────────────────┘                     │                  │
│        │                                                  │                  │
│        │  ─── RoutableMessage{ to:domain, from:routing,   │                  │
│        │        payload: UnsignedMessage,                 │                  │
│        │        signature_data, uuid } ────────────────►  │                  │
│        │                                                  │                  │
│        │                                    ┌─────────────┴─────────────┐    │
│        │                                    │ Verify HMAC signature     │    │
│        │                                    │ Check counter > last      │    │
│        │                                    │ Check not expired         │    │
│        │                                    │ Execute action            │    │
│        │                                    └─────────────┬─────────────┘    │
│        │                                                  │                  │
│        │  ◄── (opt) SessionInfo push (field 15) ───────── │  non-terminal    │
│        │  ◄── FromVCSECMessage (field 10) ─────────────── │  TERMINAL        │
│        │       addressed to our routing address;          │                  │
│        │       empty / no commandStatus = SUCCESS         │                  │
│        │       (state change also arrives as a separate   │                  │
│        │        domain-0 broadcast, which we ignore)      │                  │
│        │                                                  │                  │
│        ▼                                                  ▼                  │
│   Command executed!                                                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Passive Entry & Keyless Drive

> ✅ **Working and device-validated 2026-06-09 — full cycle: walk up → unlock → drive → walk away → auto-lock, with no command and no banner.**
> This **reverses** the earlier "not achievable" verdict in this repo. That conclusion was
> reasoned from the **official Tesla Go SDK, which deliberately omits the passive-entry
> handshake** — so it looked impossible. The fuller VCSEC proto (decompiled from the Tesla
> Android app, [`acvigue/TeslaProtobufs`](https://github.com/acvigue/TeslaProtobufs)) defines
> it, and it works on the watch. The old reasoning is preserved as superseded history below.

### How it actually works

Passive entry is a **request/response handshake the car drives** — the key never initiates.
While the app is open and the session is established, the car streams `AuthenticationRequest`
beacons (~1 Hz). The watch answers each with a **session-signed `AuthenticationResponse`**,
which registers it as a **present, authenticated key**. The car then does its own BLE ranging
(it measures *our* connection) and, on a handle pull / approach, unlocks and authorizes keyless
drive — no command, no "keyless driving enabled" banner.

Key point on the old "ranging wall": the key does **not** self-report distance — the car
relies on *its* measurement of us (the anti-relay design holds). What the old analysis missed
is that **you don't need to report distance; you need to answer the car's identification
beacons** so it counts you as a present key. The `estimatedDistance` field exists in
`AuthenticationResponse` (we send `0`) but the car ignores it in favor of its own ranging.

Frames involved (all VCSEC; **defined in the fuller proto, absent from the public Go SDK**):

| Direction | Message | Field | Contents |
|---|---|---|---|
| Car → key | `FromVCSECMessage.authenticationRequest` | **3** | `{ token (20B nonce, rotates ~5s), requestedLevel, reasonsForAuth[] }` |
| Key → car | `UnsignedMessage.authenticationResponse` | **3** | `{ authenticationLevel, estimatedDistance=0, authenticationRejection=NONE }` — session-signed, **no new crypto**, token **not** echoed |
| Car → key | `FromVCSECMessage.appDeviceInfoRequest` | **44** | `GET_MODEL_NUMBER` — car asks the key to describe itself |
| Key → car | `UnsignedMessage.appDeviceInfo` | **40** | `{ hardware_model_sha256, os=ANDROID, UWBAvailable=UNSUPPORTED }` |
| Car → key | `FromVCSECMessage.alert` | **45** | `alertHandlePulledWithoutAuth` — emitted if a handle is pulled with **no** present key (i.e. we failed to answer) |

`reasonsForAuth` enum (observed): `1 IDENTIFICATION` (idle beacon), `5 PASSIVE_UNLOCK_EXTERIOR_HANDLE_PULL`,
`8 ENTERED_HIGHER_AUTH_ZONE`, `9 WALK_UP_UNLOCK`. The car stays on `[1]` as a steady heartbeat and
flips to `[8]`/`[5]`/`[9]` as you approach and act — **we answer all of them the same way.**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           PASSIVE ENTRY HANDSHAKE                            │
│             (app open + connected; session already established)              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Watch (key)                                            Tesla               │
│      │                                                    │                  │
│      │ ◄── AuthenticationRequest (FromVCSEC f3) ───────── │  ~1 Hz beacon    │
│      │     { token (20B, rotates), requestedLevel,        │                  │
│      │       reasonsForAuth: [1 IDENTIFICATION] }         │                  │
│      │                                                    │                  │
│      │ Answer EVERY fresh token → register as PRESENT key │                  │
│      │ (dedupe by token; off while a command owns slot)   │                  │
│      │                                                    │                  │
│      │ ── AuthenticationResponse (Unsigned f3) ────────►  │  session-        │
│      │     { level, estimatedDistance:0, rejection:NONE } │  signed          │
│      │ ◄── empty ACK (addressed, request_uuid f50) ─────  │  accepted        │
│      │                                                    │                  │
│      │ ◄── AppDeviceInfoRequest (FromVCSEC f44) ────────  │  GET_MODEL       │
│      │ ── AppDeviceInfo (Unsigned f40) ────────────────►  │  {model,OS}      │
│      │ ◄── empty ACK ──────────────────────────────────   │  accepted        │
│      │                                                    │                  │
│      │      [ watch is now a registered PRESENT key ]     │                  │
│      │                                                    │                  │
│      │ ~ driver approaches / pulls handle ~               │  car ranges      │
│      │   reasonsForAuth → [8]/[9]/[5]; keep answering     │  the link        │
│      │   with a signed AuthenticationResponse             │  (its own        │
│      │                                                    │   RSSI of us)    │
│      │ ◄══ UNLOCK / keyless DRIVE authorized ═══════════  │  car decides     │
│      │     (no command sent, no banner)                   │  from its        │
│      ▼                                                    ▼  ranging         │
│                                                                              │
│   Walk away → car auto-locks (Walk-Away Lock).                               │
│   Miss the beacons (no present key) → car emits                              │
│   alertHandlePulledWithoutAuth on a pull and does NOT unlock.                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### The one hard limit (still true)

**Background presence is impossible.** The official app keeps the key present 24/7 with the
phone in your pocket, app closed. ZeppOS kills the app when you leave it — there is no
persistent background BLE service. So our passive entry works **only while the app is open and
connected**. In practice: press a watch button to open the app as you walk up; the handshake
completes in ~1–2 s and the car unlocks on the handle pull. The user accepts this trade-off.

### What it took (device iterations, 2026-06-09)

- **Answer the IDENTIFICATION beacons** (`session.js` `_handleAuthenticationRequest`, deduped by
  rotating token). Two wrong turns first: the initial guess was "only answer the handle-pull
  (reason 5) frame", but on device the car **never escalated to reason 5 while the key was
  unregistered** — it fired `alertHandlePulledWithoutAuth` instead. Answering the steady reason-1
  beacons to register presence is the fix.
- **Don't steal the command slot.** The passive responder shares the single BLE `responseCallback`;
  firing it mid-command starved connect/lock into timeouts. Gated behind `_commandInFlight` so it
  only fires when no user command owns the link.
- **Keep the session clock fresh.** `expiresAt` was `clockTime + 60` using the clock captured at
  connect; ~60 s into a connection the vehicle's clock had advanced past it → every signed message
  (commands **and** passive-auth replies) rejected `MESSAGEFAULT_ERROR_TIME_EXPIRED` (fault 17) → the
  trunk stopped auto-unlocking and the link looked "dropped". Now
  `expiresAt = clockTime + elapsedSinceCapture + 60`, tracking the vehicle's clock in real time.
- **Resilient connect.** Report `online` on session-established (initial state loads from the live
  status pushes, not gated on a `getVehicleStatus` that times out under the auth-beacon flood);
  auto-retry once on the transient "disconnected during setup" GATT drop.

### Remote Drive (explicit command path — still available)

Before passive keyless drive worked, the command-only path to driving was **Remote Start**:
`RKE_ACTION_REMOTE_DRIVE = 20` (SDK `Vehicle.RemoteDrive` / `tesla-control drive`), which rides the
same authenticated RKE path as Lock/Unlock. Device-confirmed shifting to Drive on a Model 3
(2026-06-04). It works, but the car shows a cosmetic **"keyless driving enabled"** banner (inherent
to Remote Start — an explicit, time-boxed grant). Passive keyless drive above produces **no** banner,
so Remote Drive is now a fallback rather than the primary path.

<details>
<summary>Superseded reasoning: why this was believed impossible (2026-06-04)</summary>

The earlier verdict concluded passive entry / silent drive **could not** be replicated, on two
walls. Wall #1 (no background presence) is **still true** and stands above. Wall #2 turned out to be
**wrong** — reproduced here for the record:

> **No ranging.** The car authorizes keyless drive only when it localizes a phone key via link-layer
> BLE ranging done in the car's radio/firmware. We can't supply or fake it: the only RSSI ZeppOS
> exposes is `ScanResult.rssi` (watch measuring the car, wrong direction); the key→car `UnsignedMessage`
> "carries no 'I am present / at distance X' field"; anti-relay design means the car ignores any
> self-asserted distance; and the Go SDK's receive loop discards non-terminal frames and never replies.

**Why it was wrong:** the conclusion ("therefore impossible") didn't follow from the (correct) premise
that we can't self-report distance. The car **does** range us — and that's *sufficient*. The missing
piece was the `AuthenticationRequest`/`AuthenticationResponse` handshake (absent from the Go SDK the
analysis was based on, present in the fuller proto): you don't report distance, you **answer the car's
identification beacons** to be counted as present, and the car's own ranging does the rest. The
"`UnsignedMessage` has no presence field" claim was also literally inaccurate — `authenticationResponse`
(Unsigned field 3) carries `estimatedDistance`; the car just prefers its own measurement. The "device
proof" (brake press still showed *configure phone key*) was a session that **never answered the auth
beacons**, so the car correctly saw no present key — not evidence the path is closed.

</details>

## Tesla BLE Command Reference

All commands are sent after a session is established as an HMAC-signed `RoutableMessage` whose `protobuf_message_as_bytes` (field 10) is a **bare `vcsec.UnsignedMessage`** — no `ToVCSECMessage`/`SignedMessage` wrapper. Authentication rides in `signature_data` (field 13). This matches Tesla's Go SDK (`executeRKEAction` marshals `UnsignedMessage` straight into `getReceiver`). The earlier `ToVCSECMessage{SignedMessage{UnsignedMessage}}` wrapping authenticated fine (no fault) but the vehicle parsed field 1 of our wrapper as `UnsignedMessage.InformationRequest` → replied with status and never actuated. See [Command path fixes](#command-path-fixes-2026-06-02).

### RKE Actions (Remote Keyless Entry)

Core lock/unlock commands are sent via `UnsignedMessage.rkeAction` (field 2).

| Constant | Value | Method | Description |
|----------|-------|--------|-------------|
| `RKE_ACTION_UNLOCK` | 0 | `session.unlock(cb)` | Unlock all doors |
| `RKE_ACTION_LOCK` | 1 | `session.lock(cb)` | Lock all doors |
| `RKE_ACTION_REMOTE_DRIVE` | 20 | `session.remoteDrive(cb)` | Remote Start — explicit command-path keyless drive (car shows "keyless driving enabled"). SDK `RemoteDrive` / `tesla-control drive`. Now a fallback — passive keyless drive needs no command and no banner. See [Passive Entry & Keyless Drive](#passive-entry--keyless-drive). |

**Usage:**
```javascript
import teslaSession from './lib/tesla-ble/session.js'

// Convenience methods (session auto-establishes if needed):
teslaSession.lock(result => { ... })
teslaSession.unlock(result => { ... })
teslaSession.remoteDrive(result => { ... }) // shift-to-Drive enabler
```

### Closure Move Commands (Trunk/Frunk)

Trunk and frunk use `UnsignedMessage.closureMoveRequest` (field 3), not `rkeAction`.

```javascript
import { buildClosureMoveRequest } from './lib/tesla-ble/protocol/vcsec.js'
import teslaSession from './lib/tesla-ble/session.js'

// Rear trunk: closureId=5, moveType=0 (MOVE)
const rearTrunk = buildClosureMoveRequest(5, 0)
teslaSession.sendCommand({ closureMoveRequest: rearTrunk }, result => { ... })

// Frunk: closureId=6, moveType=0 (MOVE)
const frontTrunk = buildClosureMoveRequest(6, 0)
teslaSession.sendCommand({ closureMoveRequest: frontTrunk }, result => { ... })
```

### Passive Entry (AuthenticationResponse / AppDeviceInfo)

These are **car-initiated**: the watch does not call them directly. While connected, the idle
listener (`session.js` `startStatusPushListener` → `_respondToVcsecRequest`) auto-answers the
car's `AuthenticationRequest` (FromVCSEC field 3) and `AppDeviceInfoRequest` (field 44) to keep
the watch registered as a present key. The builders live in `vcsec.js`. See
[Passive Entry & Keyless Drive](#passive-entry--keyless-drive) for the full handshake.

```javascript
import { buildAuthenticationResponse, buildAppDeviceInfo, buildUnsignedMessage,
         AUTH_LEVEL_UNLOCK, APP_OS_ANDROID, UWB_UNSUPPORTED } from './lib/tesla-ble/protocol/vcsec.js'

// Reply to AuthenticationRequest — UnsignedMessage.authenticationResponse (field 3), signed on session:
const authResp = buildAuthenticationResponse({ authenticationLevel: AUTH_LEVEL_UNLOCK, estimatedDistance: 0, rejection: 0 })
const msg = buildUnsignedMessage({ authenticationResponse: authResp })

// Reply to AppDeviceInfoRequest — UnsignedMessage.appDeviceInfo (field 40):
const info = buildAppDeviceInfo({ hardwareModelSha256: sha256(...), os: APP_OS_ANDROID, uwb: UWB_UNSUPPORTED })
const msg2 = buildUnsignedMessage({ appDeviceInfo: info })
```

`parseAuthenticationRequest` (vcsec.js) decodes the incoming request `{ token, requestedLevel,
reasonsForAuth[] }`; `reasonsForAuth` is a **packed** repeated enum, so it's unpacked from raw bytes.

### Information Requests

Read-only queries sent as `UnsignedMessage.informationRequest` (field 1). Sent as HMAC-signed authenticated commands — a session must be established first.

| Constant | Value | Description |
|----------|-------|-------------|
| `INFO_REQUEST_GET_STATUS` | 0 | Vehicle status: door/closure states, lock state, sleep, user presence |
| `INFO_REQUEST_GET_WHITELIST_INFO` | 5 | Full whitelist: all enrolled keys and their metadata |
| `INFO_REQUEST_GET_WHITELIST_ENTRY_INFO` | 6 | Single key entry: slot, role, public key |

**Usage:**
```javascript
import { buildInformationRequest, buildUnsignedMessage, buildRoutableMessage,
         INFO_REQUEST_GET_STATUS, INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
         DOMAIN_VEHICLE_SECURITY } from './lib/tesla-ble/protocol/vcsec.js'

// Vehicle status (door/lock state):
const req = buildInformationRequest(INFO_REQUEST_GET_STATUS)
const msg = buildRoutableMessage({ toDomain: DOMAIN_VEHICLE_SECURITY, payload: buildUnsignedMessage({ informationRequest: req }) })

// Whitelist entry info for slot 0:
const req = buildInformationRequest(INFO_REQUEST_GET_WHITELIST_ENTRY_INFO, null, null, 0)
```

**Vehicle Status response fields** (`parseVehicleStatus`):

| Field | Description | Values |
|-------|-------------|--------|
| `closureStatuses.frontDriverDoor` | Front driver door | 0=closed, 1=open |
| `closureStatuses.frontPassengerDoor` | Front passenger door | 0=closed, 1=open |
| `closureStatuses.rearDriverDoor` | Rear driver door | 0=closed, 1=open |
| `closureStatuses.rearPassengerDoor` | Rear passenger door | 0=closed, 1=open |
| `closureStatuses.rearTrunk` | Rear trunk | 0=closed, 1=open |
| `closureStatuses.frontTrunk` | Frunk | 0=closed, 1=open |
| `closureStatuses.chargePort` | Charge port | 0=closed, 1=open |
| `vehicleLockState` | Lock state | 0=unlocked, 1=locked |
| `vehicleSleepStatus` | Sleep state | 0=awake, 1=asleep |
| `userPresence` | Key detected | 0=absent, 1=present |

### Session Management

| Method | Description |
|--------|-------------|
| `session.requestSessionInfo(cb)` | Establish BLE session (ECDH key exchange) |
| `session.getVehicleStatus(cb)` | Fetch door/lock/sleep status |
| `session.established` | Boolean — true if session is active |
| `session.reset()` | Clear session state |
| `session.ensureSessionEstablished(cb)` | Establish session if needed, queue concurrent callers |

### Pairing Operations

Pairing-specific builders live in `lib/tesla-ble/protocol/vcsec-pairing.js` (split from `vcsec.js`).

| Operation | Description |
|-----------|-------------|
| `buildWhitelistOperation(pubKeyMsg)` | Add a key to the vehicle whitelist (requires NFC keycard tap) |
| `buildUnsignedMessageWithWhitelist(op)` | Wrap whitelist operation in unsigned message (field 16) |

### Key Roles

| Constant | Value | Description |
|----------|-------|-------------|
| `KEY_ROLE_OWNER` | 2 | Full owner access |

_(ROLE_SERVICE=1, ROLE_DRIVER=3 are defined in the Tesla SDK proto but not used in this app)_

### Key Form Factors

| Constant | Value | Description |
|----------|-------|-------------|
| `KEY_FORM_FACTOR_ANDROID_DEVICE` | 7 | Triggers NFC keycard tap UI on car touchscreen |

### Operation Status Codes

Returned in `CommandStatus.operationStatus` from vehicle responses:

| Code | Name | Meaning |
|------|------|---------|
| 0 | `OK` | Success |
| 1 | `WAIT` | Waiting (tap keycard) |
| 2 | `ERROR` | General error |
| 3 | `INVALID_REQUEST` | Malformed message |
| 4 | `INVALID_SIGNATURE` | HMAC verification failed |
| 5 | `INVALID_TOKEN` | Session token rejected |
| 6 | `INVALID_NONCE` | Replay detected (counter too low) |
| 7 | `UNKNOWN_KEY` | Key not in whitelist — **also returned on successful pairing** |

### Signature Types

| Constant | Value | When Used |
|----------|-------|-----------|
| `SIGNATURE_TYPE_PRESENT_KEY` | 2 | Pairing messages (no HMAC, key not yet enrolled) |
| `SIGNATURE_TYPE_HMAC_PERSONALIZED` | 8 | `RoutableMessage.signature_data` on authenticated commands |

## Protocol Verification vs Tesla Go SDK

Our implementation was cross-referenced against the official [Tesla vehicle-command Go SDK](https://github.com/teslamotors/vehicle-command).

> **Important distinction**: The Go SDK uses `universal_message` at higher layers, while BLE payload content is still VCSEC-oriented. For authenticated BLE commands, the SDK’s signing metadata format (`SignatureData` / `HMAC_PERSONALIZED`) applies and is mirrored here.

### Protocol Compatibility Matrix

| Aspect | Our JS implementation | Tesla Go SDK | Status |
|--------|----------------------|--------------|--------|
| Service UUID (`0x0211`) | ✅ Match | — | ✅ |
| Write char UUID (`0x0212`) | ✅ Match | — | ✅ |
| Read/Indicate char UUID (`0x0213`) | ✅ Match | — | ✅ |
| Message framing | 2-byte big-endian length header | 2-byte big-endian length header | ✅ Match |
| Max message size | 2048-byte sanity cap on the RX length prefix (orphan-fragment guard); real frames ≤1024 | 1024 bytes | ✅ Compatible (cap is generous on purpose) |
| SessionInfoRequest identity key | long-term enrolled `watchPublicKey` (`store.watchPublicKey`) | `Session.localKey.PublicBytes()` (long-term) | ✅ Match (fixed 2026-05-25 — see [Session identity key](#session-identity-key-tesla-go-sdk-parity)) |
| ECDH key material | long-term enrolled private key (held only by the phone) × `vehicleEcPublicKey`, computed **on the phone** (`BLE_COMPUTE_SHARED_SECRET`); watch caches the resulting key — no on-watch ECDH, no private key, no doublings table | `localKey.ExchangeKey(vehiclePub)` | ✅ Match (same shared secret; just computed phone-side) |
| Session key derivation | `SHA1(shared_x)[:16]` | `SHA1(shared_x)[:16]` | ✅ Match |
| RX reassembly timeout | 1000ms per chunk | 1 second per chunk | ✅ Match |
| HMAC signature type | `SIGNATURE_TYPE_HMAC_PERSONALIZED = 8` in `signature_data` | `SIGNATURE_TYPE_HMAC_PERSONALIZED = 8` | ✅ Match |
| HMAC computation | `subKey=HMAC(sessionKey,"authenticated command")`, tag over metadata + payload | Same | ✅ Match |
| Command payload (field 10) | bare `vcsec.UnsignedMessage` | `proto.Marshal(UnsignedMessage)` → `ProtobufMessageAsBytes` (`getReceiver`) | ✅ Match (fixed 2026-06-02 — was double-wrapped in ToVCSEC/SignedMessage) |
| SessionInfo `clock_time` | parsed as fixed32 LE (wire type 5) | `fixed32 clock_time = 4` | ✅ Match (fixed 2026-06-02 — was read as varint → 0 → `expires_at` always expired, fault 17) |
| Command terminal detection | FromVCSECMessage (field 10) present; success when no `commandStatus` | `done := commandStatus == nil` (`executeRKEAction`) | ✅ Match (fixed 2026-06-02) |
| `RoutableMessage.flags` | unset (`FLAG_USER_COMMAND`) → plaintext responses | `DefaultFlags = FLAG_ENCRYPT_RESPONSE` | ⚠️ Intentional: we read plaintext replies; we don't implement response decryption |
| SessionInfo tag verification | `subKey=HMAC(sessionKey,"session info")`, tag over TLV(sigType=HMAC, VIN, uuid) + encodedInfo | Same | ✅ Match |
| Outgoing uuid → RoutableMessage field | 51 (`uuid`) — vehicle uses this as SessionInfo HMAC challenge | 51 (`message.Uuid`) per `dispatcher.go` | ✅ Match (fixed 2026-05-28 — see [SessionInfo HMAC mismatch](#sessioninfo-hmac-mismatch--outgoing-uuid-was-in-wrong-field-2026-05-28)) |
| CCCD value | `0x0200` (indications) | Subscribe abstracted by Go BLE lib | ✅ Correct |
| GATT discovery | `mstBuildProfile({ pair: true, ... })` — service/char/descriptor topology declared explicitly, mirrors `@silver-zepp/easy-ble` shape | Full discovery (Tesla firmware compat handled at lower level) | ✅ Correct for ZeppOS |
| Chunk write size | Fixed 20 bytes, paced (`BLE_CHUNK_INTERVAL_MS`) | `min(negotiatedMTU, 1024) - 3` | ⚠️ Forced, not a choice: link is ATT MTU 23 (20B payload) with no API to raise it; pacing tuned to the observed link cadence to avoid dropped unacked writes |
| MTU negotiation | None — no API exists | `ExchangeMTU()` before first write | ❌ ZeppOS exposes no MTU or connection-param API; link fixed at 23, peer chunks at 20 too (see MTU Note) |
| Intermediate acks | Handled defensively | Not mentioned (transparent at lower level) | ✅ Harmless |

### MTU Note

**There is no MTU lever on ZeppOS — this was confirmed both ways.** The `@zeppos/device-types` definitions for `@zos/ble` list every `mst*` function and include no MTU or connection-parameter call; `mstConnect(addr, cb)` takes no options. The `mstSetMTU(247, …)` the code used to call was never a real function — device logs show `[BLE] mstSetMTU not available: not a function`. It has been removed.

Empirically the link runs at the BLE default **ATT MTU 23 = 20-byte payload**, and the peer is too: on 2026-06-03 the vehicle returned its 177-byte SessionInfo as **nine 20-byte notifications** (`RX notification: 20 bytes ×8` + `19 bytes`). So 20-byte chunking (`BLE_CHUNK_SIZE = 20`) is forced, not a tunable, and the single-write fast path was deleted (a sub-20B frame is simply a one-chunk send).

The inter-chunk delay `BLE_CHUNK_INTERVAL_MS` (instance-tunable via `chunkIntervalMs`) is paced to the observed per-packet link cadence (~90 ms/packet on device): these are unacked `WRITE_WITHOUT_RESPONSE` writes, so outrunning the link silently drops a chunk → the car gets a truncated request and never replies (the intermittent "ambient-only" failure).

Note the real cost this imposes: that ~90 ms cadence × 9 packets ≈ 0.8 s *just to receive SessionInfo*. A larger MTU would collapse that to ~one connection interval — which is exactly why it would be worth having — but neither MTU nor the connection interval is reachable from the app. It's a hard platform ceiling, not a missing optimization.

### BLE transport: easy-ble wrapper (sole implementation)

`session.js` and `pairing.js` both import from `lib/tesla-ble/ble.js`, the wrapper around `@silver-zepp/easy-ble`'s `BLEMaster`. This is the path validated on device, and as of 2026-06-02 it is the **only** BLE transport in the tree.

> **Removed: the direct `@zos/ble` path (`ble-native.js`).** An alternate transport that drove the raw `mst*` native API directly (no easy-ble) was developed in parallel. It reached `WhitelistOp` and `STATUS_WAIT` correctly, but the terminal 14-byte post-NFC pair indication was never delivered through either `mstOnCharaNotification` or `mstOnCharaValueArrived` on device, and we couldn't reproduce that firmware behavior in the test harness. It was deleted (along with `__tests__/ble-native.test.js`) once `ble.js` was confirmed working end-to-end. The firmware-contract notes it was written against are preserved below as a research record in case the native path is ever revisited — the `easy-ble` wrapper already handles all of this internally.

<details>
<summary>Firmware contract the native path required (historical)</summary>

- **Profile shape** — `pair: true`, outer `list[0]` with `uuid: true, size, len`, service with `len1` and `len2`, characteristic with `desc` and `len`, descriptor with `permission`. Any missing field makes `mstBuildProfile` return non-zero via `mstOnPrepare`.
- **Callback arg shape** — all `mstOn*` callbacks receive a single response object `{profile, status, uuid, data, length, chara, desc}`. Positional destructuring silently breaks.
- **Subscribe both** `mstOnCharaNotification` AND `mstOnCharaValueArrived`. Firmware routes some payloads through each; the post-NFC pair completion can land on `charaValueArrived` while ambient pushes arrive on `charaNotification`.
- **No profile-id filter on the notification handler** — some firmware reports a different `profile` value on `mstOnCharaNotification` than the one returned from `mstOnPrepare`. UUID match alone is reliable.
- **`mstOffAllCb()` on cleanup** before destroying the profile so handlers don't stack across reconnects (would corrupt multi-chunk reassembly).
- **50ms prepare guard** between registering `mstOnPrepare` and calling `mstBuildProfile`, mirroring easy-ble's `SHORT_DELAY`. Defensive against firmware that fires the prepare event synchronously inside the build call.
- **First-chunk dedup window 200ms** — when both event streams deliver the same payload, drop the duplicate by signature.

The test mock in `__mocks__/zos.js` still reproduces these contract details (object-shape callbacks, separate notification/value streams, MAC-buffer arg) since the `easy-ble` wrapper sits on the same native API underneath.

</details>

### Scan-by-name on every connect (Tesla MAC rotation)

**Symptom observed on device (2026-05-20):** Pair flow worked first try (it scans). Subsequent app opens / unlock attempts kept timing out with `[BLE] Connection timeout (5000ms)` and zero `mstConnect` callbacks — the raw ZeppOS `mstConnect(savedMAC, cb)` never fired its callback, neither success nor failure.

**Root cause:** Tesla vehicles advertise BLE under a **random resolvable address** that **rotates every ~15 minutes**. The MAC we persisted in `store.vehicleMac` during pairing was only valid in that window. Once the car rotated, `mstConnect` to the stale MAC silently hangs forever.

**Tesla Go SDK does it correctly** — it caches **only the VIN** and re-derives the BLE local name on every connection, then scans and dials whatever current address matches:

```go
// pkg/connector/ble/ble.go
func VehicleLocalName(vin string) string {
    vinBytes := []byte(vin)
    digest := sha1.Sum(vinBytes)
    return fmt.Sprintf("S%02xC", digest[:8])   // S + 16-hex + C, lowercase
}

// Every connection: scan by exact local name → dial returned address
scanVehicleBeacon(ctx, localName)   // filters: a.LocalName() == localName
client, err := device.Dial(ctx, ble.NewAddr(target.Address))
```

**Implementation (applied):**

1. `lib/tesla-ble/ble-name.js` exports `computeTeslaBLEName(vinBytes)` → `'S' + bytesToHex(sha1(vin).subarray(0,8)) + 'C'`, mirroring Tesla's algorithm (lowercase hex).
2. `teslaBLE.scan(callback, duration, expectedName)` takes an optional `expectedName` — case-insensitive exact match on `dev_name` so we lock onto the right car even with multiple Teslas nearby. Implemented in `lib/tesla-ble/ble.js`.
3. `session.js#_ensureConnected` always scans first when not already connected: derives the local name from `store.vehicleVin`, scans for it, dials whatever fresh MAC the beacon reports, and refreshes `store.vehicleMac` opportunistically.
4. `pairing.js#scanAndConnect` does the same — no MAC shortcut, always scan.
5. `store.vehicleMac` is now a transient cache hint only; session never trusts it across the rotation window.

**Why this fixes the symptom:** every connect attempts a fresh BLE scan filtered by the VIN-derived name, returning the current advertised address. `mstConnect` then dials a live address and either succeeds quickly or `mstStopScan`-then-`complete` reports the car is out of range / asleep — no more silent 5s timeout.

**Still to confirm with device:**

- Does ZeppOS `mstStartScan` reliably surface Tesla advertisements when the car is awake but our last connection was on a now-rotated MAC? (Tesla SDK assumes yes; ZeppOS may need explicit BLE adapter reset between connects.)
- Should scan duration extend on first failure (8s → 15s) before surfacing "not in range"?

### Session identity key (Tesla Go SDK parity)

**Symptom observed on device (2026-05-25):** After pair completed successfully and the BLE connection itself worked (~350 ms), every `requestSessionInfo` got back a 28-byte `RoutableMessage` containing only `SessionInfo { status: 1 }` — Tesla's `SessionInfoStatus.KEY_NOT_ON_WHITELIST`. The vehicle was refusing to derive a session because it didn't recognize the public key we presented in `SessionInfoRequest.publicKey`.

**Root cause:** `session.js` was popping a per-call ephemeral keypair from `store.keyPool` and sending the *ephemeral* pubkey in `SessionInfoRequest`. Tesla's vehicle-command Go SDK uses **one long-term enrolled keypair** for both identity (whitelist lookup) and ECDH — `Session.localKey`. Ephemeral pool keys were never on the vehicle's whitelist, so the vehicle rejected every session. (Our own `__tests__/helpers/car-simulator.js` didn't model whitelist enforcement at the time, which is why this slipped past the test suite for so long.)

**Fix (applied):**

1. `store.js` — added `watchPrivateKey` getter/setter alongside the existing `watchPublicKey`. Added to `isPaired` check and `reset()`.
2. `app-side/index.js` — `BLE_SYNC_KEYS`, `BLE_PAIR_SETUP`, and `SIMULATE_PAIR` now return both halves of the keypair (`publicKeyBinary` + `privateKeyBinary`).
3. `lib/phone.js` — `syncKeys`, `pairSetup`, `simulatePair` persist `store.watchPrivateKey`.
4. `lib/tesla-ble/session.js` — `_doSessionInfoRequest` now uses `store.watchPrivateKey` / `store.watchPublicKey` (long-term enrolled keypair) for both the `SessionInfoRequest.publicKey` field and the ECDH input. The variable names `ephemeralPrivateKey` / `ephemeralPublicKey` are kept for compatibility with the crypto path but now hold the long-term key.
5. `lib/tesla-ble/protocol/vcsec.js` — `parseRoutableMessage` now surfaces `sessionInfoStatus` separately so callers can distinguish `OK` from `KEY_NOT_ON_WHITELIST`.
6. `lib/tesla-ble/session.js` `_handleSessionInfoResponse` — explicit branch for `sessionInfoStatus === 1` that disconnects BLE immediately and surfaces "re-pair required". Without disconnecting, the vehicle's slot stayed occupied until its own supervision timeout (>6 min observed).
7. `__tests__/helpers/car-simulator.js` `_handleSessionInfo` — enforces a whitelist check against `_enrolledPublicKey`. If the requestor's key doesn't match, the simulator responds with `SessionInfo { status: 1 }` exactly like the real vehicle. The test setup helpers now generate a real P-256 keypair, persist both halves to the store, and register the pubkey with the simulator's whitelist.

The watch must hold the long-term private key locally because ECDH requires it at session time and the phone may not be reachable. Re-pair is required after upgrading from a build that pre-dates this change — existing installs only have `watchPublicKey` persisted.

> **Superseded (2026-06-10): the watch no longer holds a private key.** The premise
> above ("ECDH requires it at session time") turned out not to apply to the watch:
> ECDH always runs on the **phone** (no BigInt in QuickJS — `BLE_COMPUTE_SHARED_SECRET`),
> and `SessionInfoRequest` only needs the **public** key for identity. The watch
> validated `watchPrivateKey`'s length as a re-pair guard but never performed a
> private-key operation. So the enrolled private key was removed from the watch
> entirely: `BLE_SYNC_KEYS` / `BLE_PAIR_SETUP` send only the public key (the private
> half never crosses BLE), `store.js` dropped the `watchPrivateKey` getter/setter,
> and `isEnrolled` / the `session.js` connect guard key off `watchPublicKey`. The
> enrolled private key now lives only on the phone (companion `settingsStorage`).
> No re-pair needed to adopt — `isEnrolled` still holds via `watchPublicKey`; an
> already-paired watch's stale `watch_private_key.dat` is purged on next reset/re-pair.

### Native BLE crash recovery (avoiding the reboot loop)

**Symptom:** When a previous app run died without a clean `mstDisconnect` (forced quit, OS-killed page, or a session that hung after a half-success), every subsequent `mstConnect` to the same MAC returns `{ connected: false, status: "failed" }` after a few seconds. The only known recovery used to be a full watch reboot.

**Root cause:** The native `@zos/ble` stack on ZeppOS is a process-singleton that retains its "I own this connection" state across JS app lifetimes. `BLEMaster.quit()` in `@silver-zepp/easy-ble` only issues `mstDisconnect` when `#last_connected_mac` is set — a fresh `BLEMaster` instance after a JS restart has no idea what connect_id the prior run held, so `quit()` becomes a no-op even though the native socket is still half-open.

**Fix (applied in `lib/tesla-ble/ble.js`):**

1. After every successful connect, capture the connect_id from `BLEMaster.get.connectionID()` and persist it to `LocalStorage` under `lastBleConnectId`. This happens *immediately* upon connect, before any later step (CCCD, MTU, etc.) can fail.
2. On clean cleanup (`_cleanup()` after a successful `ble.quit()`), clear the persisted id.
3. `_clearStaleNativeState(reason)` reads the saved id and calls `hmBle.mstDisconnect(savedId)` defensively, then `mstStopScan()` + `mstOffAllCb()` to drop any lingering callbacks/scan. Invoked from:
   - The `TeslaBLE` constructor (= app start) — recovers from a prior-run crash.
   - The start of every `connect()` call — recovers from a same-run prior failure.
4. Connection timeout reduced 20 s → 8 s. Successful Tesla GATT connects observed at 350 ms typical, 2.5 s worst case. A longer wait doesn't help and makes debug cycles painful.
5. The session-establish error paths (`KEY_NOT_ON_WHITELIST`, "Response missing sessionInfo") now call `teslaBLE.disconnect()` so the vehicle slot frees up instead of waiting for its supervision timeout (>6 min).

Watch the logs for `[BLE] Clearing stale native state (app-start): mstDisconnect(N)` on launch — this means a prior run left an id and we just recovered. If you don't see it, the prior run cleaned up properly (or there was no prior connection to track).

### SessionInfo HMAC mismatch — outgoing UUID was in wrong field (2026-05-28)

**Symptom on device:** Every CONNECT after PAIR got back a valid-looking 156-byte `SessionInfo` (epoch, vehicle pubkey, valid 32-byte tag), ECDH ran successfully, then `_verifySessionInfoTag` failed with `❌ SessionInfo HMAC mismatch`. No re-pair, fresh keys, fresh table — same result every time.

**Diagnostic process (no extra device round-trips):**

1. Added `[SESSION.diag]` hex of `sessionKey[0..4]`, VIN, challenge, `sessionInfoBytes`, `expectedTag`, `gotTag` inside `_verifySessionInfoTag` (commit also kept as a permanent log line — cheap and pinpoints input bugs in one read).
2. On `BLE → VERIFY KEYS` (no car needed): confirmed `phone.priv == watch.priv`, `priv·G == enrolled pub`, no key corruption.
3. Reproduced the math offline with Node `crypto`: derived `watchPub` from `watchPriv` ✓, ran ECDH against captured `vehiclePub` → identical `sessionKey` (`1e89a7fc…`) to what the watch reported ✓, HMAC over our TLV(VIN, challenge, infoBytes) → identical `expectedTag` to what the watch computed ✓. So watch math was correct given those inputs — meaning **the vehicle was hashing different inputs**.
4. Brute-tried variants of (VIN, challenge, infoBytes) and labels against the vehicle's actual tag. Exactly one matched: **challenge = empty bytes (length 0)**. Vehicle was signing with `challenge=""`.

**Root cause:** Current Tesla `universal_message.proto` (cross-checked against the live SDK) has

```proto
bytes request_uuid = 50;
bytes uuid         = 51;
```

`buildRoutableMessage` was emitting the per-message uuid into **field 50**. The vehicle reads the uuid for the SessionInfo HMAC challenge from **field 51** (`RoutableMessage.Uuid` in Tesla Go SDK — `dispatcher.go` sets `message.Uuid = uuid` for outgoing, never `RequestUuid`). Field 51 was absent in our TX, so the vehicle's challenge was empty, but our verification used the random uuid we'd generated — mismatch every time.

The reason `vehicle-command` works in the wild: it puts the uuid in field 51 on send, and reads the response's `request_uuid` (field 50) on receive — vehicle echoes the incoming field-51 value into the response's field 50 for request/response correlation. We never sent field 51, so vehicle echoed empty back, and signed with empty challenge. Our local `_lastRequestUuid` (the value we put in field 50) was never the challenge.

**Fix (2026-05-28):**

1. `lib/tesla-ble/protocol/vcsec.js` `buildRoutableMessage` — uuid now goes in field 51, with a comment pointing at the proto field numbers and the failure mode.
2. `__tests__/helpers/car-simulator.js` `onReceive` — simulator reads the challenge from field 51 to mirror real vehicle behaviour. (Earlier the simulator and the watch were aligned on the wrong field, so the test suite couldn't catch this — single-mock blind spot.)
3. Protocol tests in `__tests__/session-protocol.test.js` updated to assert uuid presence at field 51.

`_verifySessionInfoTag` still uses our locally stored `_lastRequestUuid` (the value we sent), which is now placed in field 51 and used by the vehicle as challenge. No protocol-level need to read field 50 from the response (we own the value).

**Test simulator lesson:** The simulator was decoded the same wrong-field as the code under test, so they "agreed" and 490 tests passed while the real vehicle never could. Mocks have to model the platform's contract, not just the implementation's idiosyncrasies — already in `feedback_mocks_model_os_contract` but worth restating: when a single field number flip silently maps both sides, that's a sign the mock was written from the code instead of from the spec.

## Command path fixes (2026-06-02)

Session establishment worked for weeks, but `Lock`/`Unlock` never actuated the car. Six issues on the command/response path, each one unblocking the next, fixed in order. All verified against the [Tesla Go SDK](https://github.com/teslamotors/vehicle-command) and confirmed on real hardware (the car now locks/unlocks and the watch shows success).

| # | Bug | Symptom | Fix |
|---|-----|---------|-----|
| 1 | Dead `_requeue` re-registration in `ble.js` | Commands went deaf after the first frame ("No response callback, ignoring") | Re-arm `responseCallback` *after* the callback runs, when `result._requeue` is set |
| 2 | Unsolicited VehicleStatus pushes (domain 0) consumed as the command response | Periodic broadcasts stole the response slot | Filter by `to_destination` routing address; drop frames not addressed to this command (`parseRoutableMessage.toRoutingAddress`) |
| 3 | Weak RX dedup signature (`len_b0_b1` = frame-length prefix) | Same-length frames within 200 ms collided and got dropped | Sample payload bytes: `len_b2_b3_last` |
| 4 | `SessionInfo.clock_time` parsed as varint | Arrived as **fixed32** → read as 0 → `expires_at = 60` → every command `MESSAGEFAULT_ERROR_TIME_EXPIRED` (fault 17) | Decode `clock_time` (and `counter`) as LE fixed32 |
| 5 | Command payload double-wrapped `ToVCSECMessage{SignedMessage{UnsignedMessage}}` | Car authenticated it (no fault) but read field 1 as `UnsignedMessage.InformationRequest` → replied with status, never actuated | Send the **bare `UnsignedMessage`** as `protobuf_message_as_bytes`; HMAC over it. Matches SDK `executeRKEAction` → `getReceiver` |
| 6 | Terminal detection required `commandStatus` | Car actuated, but its ack is an **empty `FromVCSECMessage`** (field 10, len 0, no `commandStatus`) → watch waited → timed out | Terminal = field-10 payload present (even empty) or auth fault; success when no `commandStatus`. Mirrors SDK `done := commandStatus == nil` |

Notes:
- The `SignedMessage`/`ToVCSECMessage` wrapper belongs only to the **legacy un-sessioned VCSEC path** (pairing with `SIGNATURE_TYPE_PRESENT_KEY`), not to HMAC session commands — which is why pairing worked while commands didn't.
- The car's actual lock-state change arrives as a **separate domain-0 broadcast**; fix #2 correctly ignores it, so success is taken from the addressed FromVCSECMessage ack.
- The test mocks (`car-simulator`, `session-protocol`) had encoded the wrong (wrapped) shape and rubber-stamped #5; they now model the bare-`UnsignedMessage` contract.

## Pending

| Item | Status | Notes |
|------|--------|-------|
| Lock / Unlock / Trunk / Frunk actuation | ✅ Device-confirmed 2026-06-02 | See [Command path fixes](#command-path-fixes-2026-06-02). Six fixes on the command/response path; car actuates and watch shows success. |
| Passive entry + keyless drive | ✅ Device-validated 2026-06-09 | Walk up → unlock → drive → walk away → auto-lock, no command. Answer the car's `AuthenticationRequest` beacons with a signed `AuthenticationResponse` (+ `AppDeviceInfo`) to register as a present key; the car's own ranging does the rest. Works only while the app is open + connected. See [Passive Entry & Keyless Drive](#passive-entry--keyless-drive). |
| Session clock staleness (fault 17) | ✅ Fixed 2026-06-09 | `_buildAuthMessage` used a static `clockTime + 60`; ~60 s into a connection the vehicle's clock had advanced past it → every signed message rejected `TIME_EXPIRED` (fault 17), killing commands and passive-auth replies. Now `expiresAt = clockTime + elapsedSinceCapture + 60` (tracks `_clockCapturedAtMs`). |
| Connect auto-retry on setup drop | ✅ Fixed 2026-06-09 | The car occasionally drops the link mid-GATT-setup ("Vehicle disconnected during setup"); `tesla.js` `refresh` now auto-retries once after 800 ms before reporting offline. Also: `refresh` reports `online` on session-established (state from live pushes) so a `getVehicleStatus` timeout under the beacon flood no longer reads as "connection failed". |
| App-open connect gating + deferred settings sync | ✅ Applied 2026-06-09 | `page/index.js` gates auto-connect on `isPaired` (not just a cached VIN), and when paired defers the companion settings RPC until the session settles so it doesn't contend with the car connect on the one BLE radio. See [Use](#3-use). |
| Logging cleanup (hex-free hot path) | ✅ Applied 2026-06-09 | Removed per-chunk/per-notification hex, profile/frame dumps, `RX-DUMP`/`[SESSION.diag]` traces from `ble.js`/`session.js`; easy-ble `SetDebugLevel` 3 → 1; dropped the now-unused `hexDump` util. Synchronous `console.log` over the BLE side-channel was inflating connect latency. Only milestones/timings/errors remain (mismatch diagnostic is now hex-free: lengths + first-differing tag byte). |
| VIN entry | ✅ Complete | Settings page (`setting/index.js`) — TextInput for vehicle name + VIN, synced to watch via `BLE_SYNC_SETTINGS` on app open |
| MTU chunk writer | ❌ Impossible (not just blocked) | ZeppOS `@zos/ble` exposes **no** MTU or connection-parameter API — `mstSetMTU` was never a real function (device logs: `mstSetMTU not available: not a function`), `mstConnect(addr, cb)` takes no options, and the official `@zeppos/device-types` surface lists no MTU/conn-param call. Empirically the link sits at the BLE default ATT MTU 23 = 20-byte payload in **both** directions: 2026-06-03 the vehicle returned its 177-byte SessionInfo as nine 20-byte notifications. Fixed 20-byte chunking is mandatory; the dead MTU-negotiation code in `ble.js` was removed. |
| Scan-by-name on every connect | ✅ Applied | `lib/tesla-ble/ble-name.js` + scan-by-VIN in both `session.js` and `pairing.js`. See "Scan-by-name on every connect" above. Note: scan-by-name was originally hypothesized as the fix for connect-time-out-after-pair, but the actual cause turned out to be native BLE state poisoning across app sessions — see "Native BLE crash recovery". |
| Session uses long-term enrolled key | ✅ Applied | `session.js` sends `watchPublicKey` in `SessionInfoRequest`; the phone uses the enrolled private key for ECDH (`BLE_COMPUTE_SHARED_SECRET`) — the watch holds no private key. See "Session identity key (Tesla Go SDK parity)". |
| Native BLE crash recovery | ✅ Applied | `lib/tesla-ble/ble.js` persists `connect_id` and runs `mstDisconnect` on next launch. See "Native BLE crash recovery". |
| Native `@zos/ble` path (`ble-native.js`) | ❌ Removed 2026-06-02 | Reached `STATUS_WAIT` but the post-NFC 14-byte indication was never delivered on device through either notification stream, and it couldn't be reproduced in the harness. Deleted (with its test) once the easy-ble wrapper (`ble.js`) was confirmed working end-to-end. Firmware notes kept under "BLE transport". |
| Key pool removal | ✅ Done 2026-06-02 | Pool fully removed — dropped from `isPaired`, no more `syncPool` on app open / BLE page, removed from `phone.js` + `simulatePair` + checklist. It was an artifact of the old per-session ephemeral-key design (never consumed after the long-term-key refactor). The low-level `store.keyPool`/`popKey` getters are now gone too. |
| Dead `ephemeralPrivateKey` field | ✅ Done 2026-06-03 | `session.js` assigned `this.ephemeralPrivateKey = watchPriv` but never read it (the ECDH runs on the phone). Removed; the `watchPriv` length check stays as the re-pair guard. `ephemeralPublicKey` is still used (it's the SessionInfoRequest identity + SignatureData signer key). |
| Command response timeout | ✅ Done 2026-06-03 | `sendCommand` now arms an overall deadline (`commandTimeoutMs`, default 15 s) covering "vehicle never replies" and "only unsolicited pushes" — neither armed `_secondResponseTimer` (which only starts after a first addressed reply). A dropped command write previously left the callback pending forever, wedging `tesla.js`'s `busy` flag with no error and no in-app recovery (no offline overlay → no Retry button). The deadline now fails cleanly → `busy` clears → Retry path appears. |
| Vehicle EC key persistence | ✅ Done 2026-06-02 | Moved `vehicleEcPublicKey` from a null-byte LocalStorage string to a binary file (`vehicle_ec_public_key.dat`), with a legacy LS fallback. Fixes the table rebuilding via phone every launch — watch now reuses the cached table standalone. |
| Connect is phone-free after pairing | ✅ Done | Superseded the doublings-table approach entirely: the session key is derived once (phone ECDH) and **cached** (`session_key.dat`). Normal connects reuse it — no phone, no ECDH, no table. See "Session key (phone-computed ECDH, cached)" below. |
| Vehicle pub from SessionInfo (not pair response) | ✅ Applied 2026-05-28 | See "Doublings table built from SessionInfo (Go SDK parity)" below. |
| RoutableMessage uuid in field 51 (not 50) | ✅ Applied 2026-05-28 | See "SessionInfo HMAC mismatch — outgoing UUID was in wrong field". Field 50 = `request_uuid` (response-side), field 51 = `uuid` (request-side challenge source). |

## Session key (phone-computed ECDH, cached)

**Current design (2026-06-03), replacing the doublings table below.** The session key
is a constant for a paired watch+vehicle — `sha1(ECDH(watchPriv, vehiclePub))[:16]` —
because both keys are long-term and static (per-session freshness rides in the
epoch/counter/clock of each message's HMAC, not in the key). So:

1. **Pairing / first connect** (phone present): the watch sends the vehicle's EC pubkey
   (from `SessionInfo`) to the phone, which runs the BigInt P-256 ECDH and returns the
   **32-byte shared secret** (`BLE_COMPUTE_SHARED_SECRET`). The watch derives
   `sha1(secret)[:16]`, verifies the SessionInfo HMAC, and caches the key in
   `session_key.dat` (+ the vehicle EC pubkey it was derived from).
2. **Every later connect**: fast path — reuse the cached key. No phone, no ECDH, no
   table. Guarded by the stored EC pubkey matching the live `SessionInfo` pubkey; a
   mismatch (vehicle re-key) re-derives via the phone. The key is cached only *after*
   the HMAC verifies, so a wrong key never sticks.
3. **The 16 KB doublings table is gone** — never built, transferred, or stored. The
   phone-side ECDH is proven bit-identical to the old on-watch `ecdhFixed(priv, table)`
   path by `__tests__/crypto-p256.test.js`.

State getters (`lib/store.js`): `isReady` (VIN present → ready to pair), `isEnrolled`
(keypair + VIN → gates connects), `isPaired` (`isEnrolled && sessionKey` → fully usable).

Recovery: a lost/corrupted cached key (or a vehicle re-key) needs the phone to
re-derive — i.e. re-pair. There is no standalone on-watch ECDH fallback anymore.

## Doublings table built from SessionInfo (Go SDK parity)

> **⚠️ Superseded (2026-06-03).** The doublings table described in this section has
> been **removed** — see [Session key (phone-computed ECDH, cached)](#session-key-phone-computed-ecdh-cached) below.
> The phone now computes the ECDH directly and the watch caches the 16-byte session
> key; no 16 KB table is built, transferred, or stored. This section is kept as the
> history of the *vehicle-pubkey-from-SessionInfo* fix (which is still correct) and
> of the table design it originally introduced.

**The bug we fixed.** Until 2026-05-28 the phone tried to extract the vehicle's EC pubkey from field 17 (`WhitelistInfo`) of the BLE pair response. That field actually carries a signer/admin key — not the vehicle's runtime EC pubkey — so the ECDH doublings table was built for the wrong point and **every** CONNECT after PAIR died with `Invalid SessionInfo HMAC`.

Confirmed empirically with TEST KEYS + `[SESSION.diag]` (three distinct EC pubkeys observed in one session):

| Hex | Source |
|---|---|
| `0489a8…d8408e` | Watch's own pubkey |
| `04dba3…d2ada4` | Field 17 of pair response — used to build wrong table |
| `049fa7…78735d50` | `sessionInfo.publicKey` from live SessionInfo response (vehicle's actual key) |

### How it works now (matches Tesla Go SDK)

1. **PAIR** just enrolls the watch's pubkey with the vehicle. Phone-side `BLE_COMPLETE_PAIRING` is a no-op success. No EC key extraction, no table build.
2. **Immediately after pair** (still BLE-connected to vehicle, phone still in range): pairing.js fires a `SessionInfoRequest` via `teslaSession.requestSessionInfo`. The vehicle's response carries its real EC pubkey. `_ensureTableForVehiclePub` calls `phone.precomputeTable(sessionPub)` over the existing `BLE_PRECOMPUTE_TABLE` RPC. Phone returns the 16384-byte doublings table. Watch stores both `vehicleEcPublicKey` and `vehicleDoublingsTable`.
3. **Every subsequent CONNECT/command** is fully standalone: ECDH uses the stored table (no phone, no scalar-mul of arbitrary points).
4. **Vehicle pub mismatch** (rare — Tesla may rotate identity key, or user re-pairs against a different car with same VIN): `_ensureTableForVehiclePub` detects the hex change, rebuilds the table on phone, replaces the stored copy. Self-healing.
5. **Post-pair table build failure** (phone moved out of range, vehicle dozed off, etc.) is non-fatal: pairing.js logs `Table build skipped (will retry on CONNECT)` and the table will be built on the user's next CONNECT.

### Code changes

| File | Change |
|---|---|
| `app-side/index.js` `BLE_COMPLETE_PAIRING` | No-op success (`return okBin()`). No more EC extraction. |
| `lib/phone.js` `completePairing()` | Short-circuits to `cb({ success: true })`. |
| `lib/phone.js` `precomputeTable(pubBytes)` | New helper — wraps the existing `BLE_PRECOMPUTE_TABLE` RPC, returns 16384-byte Uint8Array. |
| `lib/tesla-ble/session.js` `_processSessionInfo` | Now calls `_ensureTableForVehiclePub(done)` before ECDH. |
| `lib/tesla-ble/session.js` `_ensureTableForVehiclePub` | Compares stored EC hex to SessionInfo hex; on mismatch or missing table, builds via `phone.precomputeTable` and persists. |
| `lib/tesla-ble/session.js` `requestSessionInfo` | Dropped the "no table → error" early-exit; build happens on the fly. |
| `lib/tesla-ble/session.js` `_proceedWithSession` | Stored vehicle pub no longer required upfront. |
| `lib/tesla-ble/pairing.js` | After `phone.completePairing` succeeds, fires `teslaSession.requestSessionInfo` to build the table while still connected. |
| `lib/store.js` `isPaired` | No longer requires `vehicleEcPublicKey` / `hasDoublingsTable` — those land on first connect, not at pair. |
| `lib/tesla-ble/protocol/vcsec.js` `parseWhitelistEntryInfo` | Removed (2026-05-28). It misread `KeyIdentifier.publicKeySHA1` (20 B hash) as the 65-byte EC point. The 65-byte length gate in `parsePairingResponse` always rejected it so nothing real depended on it, but keeping the path risked a future "fix" silently building the doublings table from a hash. Tesla Go SDK never extracts vehicle EC from a pair response — only from `SessionInfo.publicKey`. |
| `lib/tesla-ble/protocol/vcsec-pairing.js` `parsePairingResponse` | Dropped the field-17 extraction block and the `vehiclePublicKey` field from every return value. Consumers (`pairing.js`) only ever read `status` / `error` / `dbg`. |

### Diagnostics

- **`[SESSION.diag]`** lines in `session.js._ensureTableForVehiclePub` print `sessionInfo.publicKey` and `store.vehicleEcPublicKey` hex whenever a rebuild is needed.

> The keypair-verification diagnostics — the **TEST KEYS** / **GENKEY** / **TEST BLE** buttons on the BLE debug page, plus the `VERIFY_KEYPAIR` phone RPC (and its `derivePublicKey` helper) and `phone.verifyKeypair()` — were removed on 2026-06-02 once pairing/session/commands were confirmed on hardware. They were one-off debugging aids for the HMAC-mismatch hunts documented above; the historical references to "TEST KEYS" / "VERIFY KEYS" elsewhere in this doc describe how those bugs were found, not a tool that still exists.

### Migration notes

Existing installs have a stale (wrong) doublings table on disk. After deploying this change:

- The first CONNECT will detect the mismatch and rebuild automatically. No user action required.
- The post-pair table build means a fresh PAIR is also self-healing — no need to manually re-pair to clear stale state.
- `vehicleEcPublicKey` LocalStorage entry no longer matters for correctness; it's just an optimization marker to skip table rebuilds.

## Future Work

### Infotainment Domain (AES-GCM)

Current scope covers the VCSEC domain only (lock, trunk, frunk, status) — HMAC-signed plaintext protobuf. The infotainment domain (`DOMAIN_INFOTAINMENT = 3`) unlocks lights, horn, windows, sunroof, charge port, and media controls, but uses AES-128-GCM encrypted payloads over the same BLE transport.

**What's needed:**
- Pure-JS AES-128-GCM implementation (~300-500 LOC — no WebCrypto on ZeppOS QuickJS)
- Second `SessionInfoRequest` with `domain = 3` → separate session key
- `CarServer.Action` protobuf schema (new message family)
- Encrypt/decrypt path parallel to existing HMAC path

**Reusable:**
- Existing P-256 long-term `watchPrivateKey` serves both domains (one identity key, two handshakes — same as Tesla Go SDK's `Session.localKey`)
- Same BLE transport, same `RoutableMessage` envelope, same framing
- Simulator scaffolding extends cleanly

**Optimizations:**
- Ship AES S-box / T-tables as static constants (~4KB, 3-5× speedup)
- Cache per-session AES key schedule + GHASH `H` in memory (amortize across commands in the 5-min session window)

No phone-side precomputation shortcut exists — AES key schedule and GHASH `H` depend on the runtime `sessionKey` derived post-ECDH.

## File Structure

```
amazla_key/
├── page/
│   ├── index.js                  # Main UI (lock/unlock/trunk/frunk + vehicle status)
│   └── ble/
│       └── index.js              # BLE debug page (PAIR / CLEAR / CONNECT / LOCK / UNLOCK + status checklist + log)
├── setting/
│   └── index.js                  # Companion settings page (vehicle name + VIN entry)
├── lib/
│   ├── phone.js                  # Phone class — IPC wrapper for companion app methods
│   ├── tesla.js                  # High-level Tesla API (lock/unlock/status facade)
│   └── tesla-ble/
│       ├── README.md             # Module-level design notes
│       ├── pairing.js            # createPairingController — headless pairing state machine
│       ├── ble.js                # Low-level BLE — @silver-zepp/easy-ble wrapper. Sole transport; imported by session.js and pairing.js; validated end-to-end on device.
│       ├── ble-name.js           # computeTeslaBLEName(vin) → 'S' + sha1(vin)[:8] hex + 'C'. Mirrors Tesla Go SDK VehicleLocalName. Used by scan-by-name on every connect (MAC rotates every ~15 min).
│       ├── session.js            # Session mgmt (cached key, signing, commands)
│       ├── index.js              # Tesla BLE API (high-level wrapper)
│       ├── crypto/
│       │   ├── p256.js           # P-256 (ecdhFixed — kept for the equivalence test)
│       │   ├── sha256.js         # SHA-256 / SHA-1
│       │   ├── hmac.js           # HMAC-SHA256
│       │   └── binary-utils.js   # Hex / binary-string helpers
│       └── protocol/
│           ├── protobuf.js       # Protobuf encoding/decoding
│           ├── vcsec.js          # Tesla VCSEC message builders/parsers
│           └── vcsec-pairing.js  # Pairing-specific builders (WhitelistOperation, etc.)
├── __mocks__/
│   └── zos.js                    # @zos/* stubs + BLEHarness (VCR-style BLE interception)
└── __tests__/
    ├── helpers/
    │   ├── car-simulator.js      # CarSimulator — full P-256/HMAC vehicle response simulator
    │   ├── scenarios.js          # Pre-built vehicle state patches (lockedCar, sleeping, etc.)
    │   └── session-setup.js      # Shared boot harness (store + BLE + sim) for session tests
    ├── car-simulator.test.js     # End-to-end VCR tests (BLE connect → session → RKE → status)
    ├── pairing-controller.test.js # Pairing controller integration tests
    ├── phone.test.js             # Phone class unit tests
    ├── session-protocol.test.js  # Session protocol unit tests
    ├── session-edge.test.js      # Session edge cases (HMAC verify, fault paths)
    ├── ble-communication.test.js # BLE layer tests
    ├── pairing-flow.test.js      # Pairing handshake tests
    ├── vcsec.test.js             # VCSEC protobuf encode/decode
    ├── protobuf.test.js          # Protobuf primitives
    ├── ble-crypto.test.js        # phone-side P-256 + shared-secret tests
    ├── crypto-p256.test.js       # P-256 math tests
    ├── crypto-hmac.test.js       # HMAC-SHA256 tests
    ├── store.test.js             # Store persistence tests
    └── ...                       # Additional unit tests
```

## Storage Files

Two storage backends: `LocalStorage` (key-value, binary-string-encoded) and binary `.dat` files.

### LocalStorage (via `@zos/storage LocalStorage`)

| Key | Contents | Format | Managed By |
|-----|----------|--------|------------|
| `watchPublicKey` | 65-byte enrolled public key | binary string | `BLE_SYNC_KEYS` phone sync |
| `vehicleMac` | Vehicle BLE MAC address | plain string | Auto-saved on scan |
| `vehicleVin` | Vehicle VIN | binary string (getter returns `Uint8Array`) | Saved during pairing |
| `vehicleName` | Vehicle display name | plain string | Saved during pairing |
| `vehicleModel` | Vehicle model | plain string | Saved during pairing |

> **Note**: keys/points with null bytes are stored as **files**, not LocalStorage — null bytes corrupt later LocalStorage writes on ZeppOS (see Binary Files below). `vehicleEcPublicKey` and the cached `sessionKey` are file-backed for this reason; `vehicleEcPublicKey` keeps a one-time legacy LocalStorage fallback so an already-paired watch migrates without re-pairing. (The watch no longer stores a private key — see "Superseded (2026-06-10)" above.)

### Binary Files (via `@zos/fs`)

| File | Size | Format | Managed By |
|------|------|--------|------------|
| `watch_private_key.dat` | 32 bytes | Raw binary | **Legacy / removed 2026-06-10** — the watch no longer stores a private key (it lives only on the phone). Stale files from older installs are purged on reset/re-pair. |
| `vehicle_ec_public_key.dat` | 65 bytes | Raw binary | Vehicle EC pubkey from SessionInfo (saved on first connect; the fast-path guard for the cached session key) |
| `session_key.dat` | 16 bytes | Raw `sha1(ECDH)[:16]` symmetric key | derived once via `BLE_COMPUTE_SHARED_SECRET` (phone ECDH), cached |

## Setup Guide

### 1. Deploy to Watch & Pair with Tesla

**Navigation**: Index page → BLE button

1. Enter the vehicle name + VIN in the companion settings page first (the VIN derives the BLE scan name)
2. Open app on watch → tap **BLE** button → BLE debug page
3. Tap **PAIR** → scans for the Tesla by its VIN-derived name, connects, and initiates enrollment
4. **Tap your NFC keycard** on car's center console when prompted
5. Watch logs show: **"✓ Session key derived — standalone"** ✅
6. Pairing complete!

**What happens**: After the whitelist enrollment succeeds, the watch immediately fires a `SessionInfoRequest`. The vehicle's response carries its 65-byte EC public key. The phone (still in range) computes the ECDH and returns the 32-byte shared secret; the watch derives `sha1(secret)[:16]` and caches the session key. That cached key is reused for every future session — the watch is then fully standalone.

### 2. Session crypto (no per-session keys)

The session crypto uses the long-term enrolled key from pairing (matches Tesla Go SDK's `Session.localKey`) — no per-session key, no key pool. The old ephemeral pool was **removed** (2026-06-02). The watch holds only the enrolled **public** key (`watchPublicKey`); the **private** key stays on the phone, which computes the ECDH **on the phone** once after pairing (`BLE_COMPUTE_SHARED_SECRET`). The resulting session key is cached on the watch; after that the watch needs no phone. (The earlier 16 KB doublings table was removed 2026-06-03; the watch-side private key was removed 2026-06-10.)

### 3. Use!

- Open app → main page shows vehicle control (lock/unlock/frunk/trunk)
- Commands auto-establish a BLE session when needed
- Tap **BLE** button for debug info / re-pairing

**On open** (`page/index.js`): auto-connect is gated on **`isPaired`** (enrolled keypair +
cached session key), not merely on a cached VIN — a VIN can be synced from the phone without
the keypair, and that can't establish a session. When paired, `tesla.connect()` runs and the
companion **settings sync is deferred** until the session settles, so its phone RPC doesn't
contend with the car scan/connect on the watch's single BLE radio. When not paired, settings
sync runs immediately and `connect()` fast-fails on the enrollment gate (no BLE), landing the
offline overlay (Retry / BLE Setup).

**Connection timing**:
- First connect after pairing: one-time phone ECDH while deriving the key
- Subsequent connects: fast path reuses the cached session key (no ECDH). The floor is ~1.8 s —
  GATT connect (~340 ms, firmware) + profile prepare (~490 ms, firmware) + the SessionInfo
  download (~1 s: 175 B as nine 20 B notifications at the connection interval; ATT MTU 23 is
  unreachable on ZeppOS). Plus the VIN-name scan and a 200 ms pre-dial settle.

> **Logging is off the hot path.** `lib/tesla-ble/ble.js` and `session.js` are **hex-free** — the
> per-chunk / per-notification hex dumps, full profile/frame dumps, and `RX-DUMP` / `[SESSION.diag]`
> traces were removed (each `console.log` ships synchronously over the BLE side-channel on QuickJS
> and competed with the link during connect), and easy-ble's `SetDebugLevel` was dropped 3 → 1 (it
> logged an `EXEC:` line per chunk write). Only milestones, timings, and errors remain — plus a
> hex-free SessionInfo-HMAC-mismatch line (input lengths + first-differing tag byte) that fires
> only on failure. Flip verbosity back on from git history when debugging the wire.

### Troubleshooting

**"Invalid public key" error during pairing?**
- Post-pair `SessionInfoRequest` did not return a valid 65-byte vehicle EC key
- Make sure the car is awake and the phone is in BLE range when pairing finishes
- Try pairing again — the next CONNECT will retry the session-key derivation

**Need to re-pair?**
1. Tap **BLE** button on main page → BLE debug page
2. Tap **CLEAR** button (removes saved MAC and EC key)
3. Tap **PAIR** again

## Tesla SDK Protocol - Vehicle EC Key Acquisition

The vehicle's 65-byte P-256 EC pubkey is needed for the ECDH that derives the session key. It comes from the **SessionInfo response** to the very first `SessionInfoRequest`, NOT from the pair response.

(Earlier versions of this app tried to extract the vehicle pubkey from field 17 of the pair response — that field is `WhitelistInfo` and carries a signer/admin key, not the runtime EC key. See "Doublings table built from SessionInfo (Go SDK parity)" above for the history.)

### Current Flow

| Phase | Message | Direction | Content |
|---|---|---|---|
| 1. Pair | `WhitelistOperation` | → Vehicle | Add watch's pubkey to whitelist (user taps NFC card) |
| 1. Response | `CommandStatus` / `WhitelistOperationStatus` | ← Vehicle | Pair OK |
| 2. SessionInfoRequest | `RoutableMessage` with `session_info_request` | → Vehicle | Watch's pubkey as identity |
| 2. SessionInfoResponse | `RoutableMessage.session_info` | ← Vehicle | **`publicKey` = vehicle's 65-byte EC key**, epoch, counter, HMAC tag |
| 3. Key derive | `BLE_COMPUTE_SHARED_SECRET` | Watch → Phone | Send vehicle pub; phone returns the 32-byte ECDH shared secret |
| 4. Storage | — | Watch | `sessionKey = sha1(secret)[:16]`; save `session_key.dat` + `vehicleEcPublicKey` |

Step 2 fires immediately after pair completes (in `pairing.js`, via `teslaSession.requestSessionInfo`) so the key is derived while the phone is still in range and the BLE connection is still up. After that, the watch is standalone for every subsequent CONNECT.

If a CONNECT later finds the vehicle's pubkey has changed (`store.vehicleEcPublicKey` hex ≠ `sessionInfo.publicKey` hex), `_deriveAndCacheSessionKey` re-derives via the phone on the fly — phone needs to be in range that one time.

### References

- **Tesla SDK Proto**: https://github.com/teslamotors/vehicle-command/blob/main/pkg/protocol/protobuf/vcsec.proto
- **Watch implementation**: `lib/tesla-ble/session.js` (`_processSessionInfo`, `_deriveAndCacheSessionKey`)
- **Phone implementation**: `app-side/index.js` (`BLE_COMPUTE_SHARED_SECRET` action), `app-side/ble-crypto.js` (`computeSharedSecret`), `lib/phone.js` (`computeSharedSecret`)

## Development

### Build

```bash
zeus build     # Build for deployment
zeus preview   # Preview in simulator
```

### Test

```bash
npm test       # Run Jest tests
```

### Mock Mode

A scripted car simulator lives in `__tests__/car-simulator.test.js` and covers pairing, session setup, and command flows end-to-end against the real protocol code. Run with `npm test`.

## Supported Devices

- Amazfit GTR 4
- Amazfit GTS 4
- Amazfit Balance
- Other ZeppOS 3.0+ devices

## Documentation

- [ZeppOS Documentation](https://docs.zepp.com/docs/intro/)
- [ZeppOS BLE API](https://docs.zepp.com/docs/reference/device-app-api/newAPI/ble/mstBuildProfile/)
- [Tesla Vehicle Command Protocol](https://github.com/teslamotors/vehicle-command/blob/main/pkg/protocol/protocol.md)
- [Tesla BLE Protocol](https://github.com/teslamotors/vehicle-command/blob/main/pkg/protocol/protocol.md#ble)
- [Tesla Fleet API](https://developer.tesla.com/docs/fleet-api)

## License

MIT
