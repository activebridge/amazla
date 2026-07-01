# Amazla - Tesla Watch App

ZeppOS app for controlling Tesla vehicles from Amazfit smartwatches.

## Features

- **BLE Direct Control** - Bluetooth control without internet, fully standalone
- **Lock / Unlock / Trunk / Frunk** - HMAC-signed RKE commands
- **Charge Port** - **infotainment-domain** (AES-128-GCM) command — see [Infotainment Domain](#infotainment-domain-aes-gcm--implemented)
- **Charge Status** - battery %, range, and charging state read over the infotainment domain (`getChargeState`); tap-to-refresh readout (currently disabled in the UI while VCSEC owns the single BLE slot)
- **Passive Entry & Keyless Drive** - walk up → unlock → drive → walk away → auto-lock, with **no command** (the car unlocks/authorizes from its own ranging once the watch is a present key), while the app is open + connected — see [Passive Entry & Keyless Drive](#passive-entry--keyless-drive)
- **Drive (Remote Start)** - `RKE_ACTION_REMOTE_DRIVE`; explicit command-path "shift to Drive" — a fallback to passive keyless drive above
- **Vehicle Status** - Door/closure states, lock state, sleep status; last-known state painted instantly on load, refreshed live; a dozing car is woken (`RKE_ACTION_WAKE_VEHICLE`) when it won't answer
- **Offline session** - The session keys (derived via phone ECDH, one per domain) are cached on the watch, so session establishment needs no phone after pairing

### App / UX

- **Single-screen UI** - the main page is one screen: the Model Y top-view (reflecting live lock/door/trunk state) with the lock/unlock/frunk/trunk buttons; a curved **connection-status arc** at the bottom (Connecting / Connected / Out of range / Disconnected) and, while connecting, a dim veil + spinner over the last-known (cached) car state
- **Guided setup** - an un-paired watch auto-routes to the pairing page; with no VIN it shows "open the phone app", once the VIN syncs it walks setup → pair → NFC tap → success (with an unlock chirp to confirm)
- **In-app purchase (KiezelPay)** - the app is licensed via KiezelPay; with no time-based trial, an unlicensed launch opens the purchase dialog (`kpay.startPurchase()`), gated on `kpay.isLicensed()` — see [`shared/kpay-config.js`](shared/kpay-config.js)
- **Reset / unpair** - a Reset button clears the watch storage + live session (`tesla.reset()`) and the phone's settings storage (`RESET` RPC), then returns to pairing; a `createModal` confirm reminds the user to also remove the key in the Tesla (Locks menu)
- **Haptics** - short vibration on command acks and pairing milestones via the shared `zeppify` `vibro` (unified v1/v2/v3 vibrator)

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

Walk up → unlock → drive → walk away → auto-lock, with no command and no banner, while the app is
open and connected. The handshake is **absent from the official Tesla Go SDK** but defined in the
fuller VCSEC proto (decompiled from the Tesla Android app,
[`acvigue/TeslaProtobufs`](https://github.com/acvigue/TeslaProtobufs)).

### How it works

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

### The one hard limit

**Background presence is impossible.** The official app keeps the key present 24/7 with the phone in
your pocket, app closed. ZeppOS kills the app when you leave it — there is no persistent background
BLE service. So passive entry works **only while the app is open and connected**. In practice: press
a watch button to open the app as you walk up; the handshake completes in ~1–2 s and the car unlocks
on the handle pull.

### Remote Drive (explicit command path)

The command path to driving is **Remote Start**: `RKE_ACTION_REMOTE_DRIVE = 20`
(SDK `Vehicle.RemoteDrive` / `tesla-control drive`), which rides the same authenticated RKE path as
Lock/Unlock. The car shows a cosmetic **"keyless driving enabled"** banner (inherent to Remote Start —
an explicit, time-boxed grant); passive keyless drive above produces **no** banner, so Remote Drive is
a fallback rather than the primary path.

## Infotainment Domain (AES-GCM)

The charge port opens from the watch over `DOMAIN_INFOTAINMENT = 3`, including standalone (cached d3
key, no phone). VCSEC (lock/unlock/status) signs plaintext protobuf with HMAC. The infotainment domain carries
`CarServer.Action` protobufs **encrypted with AES-128-GCM** — same BLE transport, same
`RoutableMessage` envelope, different domain, different crypto:

| Aspect | VCSEC (domain 2) | Infotainment (domain 3) |
|---|---|---|
| Payload | plaintext `vcsec.UnsignedMessage` | AES-128-GCM **ciphertext** of `carserver.Action` |
| Auth | HMAC-SHA256 tag, subkey `HMAC(key, "authenticated command")` | GCM auth tag; the session key is used **directly** (no subkey) |
| AAD / metadata | TLV prepended into the HMAC input | `SHA256(metadata TLV ‖ 0xFF)` as the GCM AAD |
| Session key | `sha1(ECDH(watchPriv, VCSEC pubkey))[:16]` | `sha1(ECDH(watchPriv, **d3 pubkey**))[:16]` — see below |
| Signature type | `HMAC_PERSONALIZED = 8` | `AES_GCM_PERSONALIZED = 5` (SignatureData field 5: epoch, 12-B nonce, counter, expires_at fixed32, 16-B tag) |

### The key discovery: each domain has its own EC key pair

The original plan assumed both domains share one session key (same ECDH secret, different
algorithms). **Wrong — and the car said so with `MESSAGEFAULT_ERROR_INVALID_SIGNATURE` (fault 5).**
Domain 3 runs on a different ECU with its **own** P-256 key pair: its `SessionInfo` returns a
different `publicKey` than VCSEC's, so the GCM key must be derived against *that* point. The Go
SDK does exactly this (one `NewSession` per domain off that domain's `SessionInfo.publicKey`);
the "shared key" reading conflated shared *derivation* with shared *peer key*.

Key resolution (`session.js` `_resolveInfotainmentKey`), in order:

1. d3 pubkey == VCSEC pubkey → reuse the VCSEC session key (same ECDH);
2. cached d3 key whose stored pubkey matches → use it (**standalone fast path**, no phone);
3. otherwise → phone ECDH (`BLE_COMPUTE_SHARED_SECRET` with the d3 pubkey), `sha1(secret)[:16]`.

The resolved key is **verified against the d3 SessionInfo HMAC tag before signing anything** — a
wrong key fails locally and explicitly instead of as the car's opaque fault 5 — and is cached
(`inf_session_key.dat` + `inf_ec_public_key.dat`) only after that verification passes. Like the
VCSEC key, first derivation needs the phone once; every later use is standalone.

### Command flow (charge port)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       INFOTAINMENT COMMAND FLOW (domain 3)                    │
│                 (VCSEC session already established & verified)                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      Watch                                              Tesla                │
│        │                                                  │                  │
│        │ ── SessionInfoRequest { toDomain: 3 } ─────────► │                  │
│        │    (enrolled watch pubkey, fresh routing addr)   │                  │
│        │                                                  │                  │
│        │ ◄─ SessionInfo(d3) ────────────────────────────  │  addressed       │
│        │    { d3 publicKey, epoch, counter, clock_time }  │  to our          │
│        │    + HMAC tag                                    │  routing addr    │
│        │                                                  │                  │
│   ┌────┴──────────────────────────────────┐               │                  │
│   │ Resolve d3 key (VCSEC / cached / phone│               │                  │
│   │ ECDH) → VERIFY SessionInfo tag with it│               │                  │
│   │                                       │               │                  │
│   │ plaintext = carserver.Action{         │               │                  │
│   │   vehicleAction.chargePortDoorOpen{} }│               │                  │
│   │ aad   = SHA256(metadata TLV ‖ 0xFF)   │               │                  │
│   │ nonce = 8B random ‖ counter (BE)      │               │                  │
│   │ ct,tag= AES-128-GCM(key,nonce,pt,aad) │               │                  │
│   └────┬──────────────────────────────────┘               │                  │
│        │                                                  │                  │
│        │ ── RoutableMessage{ to:3, payload: ct,           │                  │
│        │      SignatureData.AES_GCM_Personalized{         │                  │
│        │        epoch, nonce, counter,                    │                  │
│        │        expires_at, tag } } ───────────────────►  │                  │
│        │                                                  │                  │
│        │ ◄─ addressed reply (fields 6,7,10,50,51;         │  port            │
│        │    NO signedMessageStatus fault) ──────────────  │  actuates        │
│        ▼                                                  ▼                  │
│   Charge port open. (fault 5 = wrong key; fault 17 = clock expired)          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Unsolicited VCSEC traffic (auth beacons, `AppDeviceInfoRequest`) keeps streaming on the same
characteristic during all of this; both d3 waits filter by **our routing address** and requeue
everything else — the first device run consumed a 13-byte beacon as its "reply" and timed out
while the real 177-byte d3 answer went unclaimed.

Implementation notes: AES-128-GCM is pure JS (`crypto/aes-gcm.js`, byte-verified against Node);
the 12-byte GCM nonce is 8 random-ish bytes ‖ the strictly-increasing 4-byte counter (ZeppOS has no
CSPRNG, so the counter half guarantees uniqueness); TX frames are serialized in `ble.js` (interleaved
20-byte chunk streams would corrupt both frames); and each command owns only its own BLE response
registration on teardown.

### Reading data: Charge Status (battery %)

`GetVehicleData` is **one** request with a getter flag per state group — you don't fetch
properties individually. Setting `getChargeState` returns the whole `ChargeState` (≈60 fields)
in one round-trip. The request is the same encrypted `_infotainmentCommand` path as charge port:
`Action{ VehicleAction{ getVehicleData{ getChargeState{} } } }`.

**Data reads require an encrypted response — actuations don't.** A data read *without*
`FLAG_ENCRYPT_RESPONSE` is rejected with `MESSAGEFAULT_ERROR_REQUIRES_RESPONSE_ENCRYPTION` (fault 28). An *actuation* reply (charge port)
is a plaintext ack (`0a00` = `Response.actionStatus{} = OK`); a *data* reply is AES-GCM encrypted.
So `getChargeState` sets `flags = FLAG_ENCRYPT_RESPONSE` (RoutableMessage field 52) and **decrypts**
the reply with the same `gcmDecrypt` used for the request. Once decrypted it's just protobuf walking:

```
RoutableMessage field 10  (plaintext)
  └─ carserver Response { actionStatus(1), vehicleData(2) }
       └─ VehicleData.charge_state(3)
            └─ ChargeState { charging_state(1), battery_range(111, float32-LE),
                             battery_level(114, int32) }
```

**Response decryption** (byte-locked against the Go SDK in `aes-gcm-signing.test.js`): the reply
carries its GCM `{ nonce, counter, tag }` in `SignatureData.AES_GCM_Response_data` (field 13 → 9)
and the ciphertext in field 10. The decryption AAD is `SHA256` of a metadata TLV
(`SIGTYPE=9, DOMAIN=3, PERSONALIZATION=VIN, COUNTER, FLAGS, REQUEST_HASH, FAULT`), where
`REQUEST_HASH` binds the response to our request (`AES_GCM_PERSONALIZED(5) ‖ our request GCM tag`).
Because we set the flag on the request, the **request** metadata must also include `TAG_FLAGS(7)`
or the car rejects the request itself. Errors always come back as a plaintext status (field 12),
so a fault is read before any decrypt is attempted.

`charging_state` (field 1) is a `ChargingState` message wrapping a **oneof of empty `Void`s** —
the *field number that's present* is the state (1 Unknown, 2 Disconnected, 3 NoPower, 4 Starting,
5 Charging, 6 Complete, 7 Stopped, 8 Calibrating), so we read which field is set, not a value.
`parseChargeStateResponse` (`protocol/carserver.js`) walks this path and returns
`{ ok, level, range, state }`, `ok:false` (never a throw) on any shape mismatch — the caller then
logs the raw bytes for reconciliation, the same diagnostic discipline as the HMAC/GCM work.
`battery_range` is `float32` little-endian (protobuf fixed32); `decodeFloat32LE` decodes the bits
by hand (no `DataView` dependency in this path).

**State storage & UI.** The decoded snapshot goes into the one `lastVehicleState` blob, but in a
nested `charge` block carrying its **own capture timestamp** — because infotainment data is
*pull-only* (the car streams no charge pushes, unlike VCSEC status), so it can be confidently
stale and the UI dims a value older than an hour. See [State caching](#state-caching). The watch
auto-loads charge after the status fetch on connect (sequential — they share the one BLE slot);
the top-of-screen battery readout is also tap-to-refresh.

### Remaining in this domain

Charge port + charge status proved both the write and read paths; still to build (mechanical, same
`_infotainmentCommand` path):

- **Climate** — `VehicleAction.hvacAutoAction` (builder already in `protocol/carserver.js`); pairs
  with reading `getClimateState` (temps, seat heaters, defrost) via the same `GetVehicleData` request
- **More `GetVehicleData` groups** — `ClosuresState`, `DriveState` (speed/odometer/route ETA),
  `TirePressureState`, `SoftwareUpdateState` (version, download %). Each is one more getter flag on
  the same request and one more `parse*` walker; flag only the groups the UI shows (response size)

## Tesla BLE Command Reference

All commands are sent after a session is established as an HMAC-signed `RoutableMessage` whose `protobuf_message_as_bytes` (field 10) is a **bare `vcsec.UnsignedMessage`** — no `ToVCSECMessage`/`SignedMessage` wrapper. Authentication rides in `signature_data` (field 13). This matches Tesla's Go SDK (`executeRKEAction` marshals `UnsignedMessage` straight into `getReceiver`). Note: the `ToVCSECMessage{SignedMessage{…}}` wrapper belongs only to the legacy un-sessioned pairing path — an HMAC session command must be the bare `UnsignedMessage`, or the vehicle reads field 1 as `InformationRequest` and never actuates.

### RKE Actions (Remote Keyless Entry)

Core lock/unlock commands are sent via `UnsignedMessage.rkeAction` (field 2).

| Constant | Value | Method | Description |
|----------|-------|--------|-------------|
| `RKE_ACTION_UNLOCK` | 0 | `session.unlock(cb)` | Unlock all doors |
| `RKE_ACTION_LOCK` | 1 | `session.lock(cb)` | Lock all doors |
| `RKE_ACTION_REMOTE_DRIVE` | 20 | `session.remoteDrive(cb)` | Remote Start — explicit command-path keyless drive (car shows "keyless driving enabled"). SDK `RemoteDrive` / `tesla-control drive`. Now a fallback — passive keyless drive needs no command and no banner. See [Passive Entry & Keyless Drive](#passive-entry--keyless-drive). |
| `RKE_ACTION_WAKE_VEHICLE` | 30 | `session.wake(cb)` | Wake a dozing vehicle (SDK `tesla-control wake -b`). A dozing car keeps beaconing but **ignores `GET_STATUS`** — device-observed: a connect-time status fetch stayed silent for 15 s while the identical fetch right after an actuation was answered in 0.8 s. `tesla.refresh` sends this automatically when the initial short status fetch gets no answer. Value verified in both the official and acvigue protos (sparse enum — 29 is `AUTO_SECURE_VEHICLE`). |

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

### Infotainment Commands (carserver, AES-GCM)

Charge port is **not** a VCSEC closure — per the Tesla SDK it lives in the infotainment domain
as a `carserver.Action`, encrypted with AES-128-GCM. See
[Infotainment Domain](#infotainment-domain-aes-gcm--implemented) for the full path. The
`VehicleAction` builders live in `protocol/carserver.js`; `_infotainmentCommand` handles the
d3 session, key resolution, encryption, and reply filtering.

```javascript
import teslaSession from './lib/tesla-ble/session.js'

// Charge port open (the UI charge-port button uses this):
teslaSession.chargePortInfotainment(result => { ... })

// Read charge state. result.charge = { level, range, state }:
teslaSession.getChargeState(result => { if (result.success) { /* result.charge.level, … */ } })
```

| Builder (`protocol/carserver.js`) | carserver field | Status |
|---|---|---|
| `buildChargePortOpenAction()` | `VehicleAction.chargePortDoorOpen` (62) | ✅ |
| `buildChargePortCloseAction()` | `VehicleAction.chargePortDoorClose` (61) | built, not yet wired to UI |
| `buildHvacAutoAction()` | `VehicleAction.hvacAutoAction` (10) | built, not yet wired to UI |
| `buildGetChargeStateAction()` + `parseChargeStateResponse()` | `VehicleAction.getVehicleData` (1) → `getChargeState` (2); request sets `FLAG_ENCRYPT_RESPONSE`, reply is AES-GCM-decrypted then walked | ✅ built (disabled in UI) |

_(The experimental VCSEC `session.chargePort` — `ClosureMoveRequest.chargePort` — is kept for
comparison but is not what the button uses.)_

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
| `session.getVehicleStatus(cb, timeoutMs?)` | Fetch door/lock/sleep status. Optional deadline override — the app-load fetch uses a short 4 s one so a dozing car falls through to `wake()` + re-fetch instead of burning the full 15 s. Dispatches passive-entry beacons to the responder while it waits (an enrolled key that ignores them gets the link dropped by the car in ~8 s). |
| `session.wake(cb)` | `RKE_ACTION_WAKE_VEHICLE` — wake a dozing car so it answers status requests |
| `session.chargePortInfotainment(cb)` | Charge port open via the infotainment domain (AES-GCM) |
| `session.getChargeState(cb)` | Read battery %, range, charging state (infotainment domain). `cb({ success, charge: { level, range, state } })` — sets `FLAG_ENCRYPT_RESPONSE` and AES-GCM-decrypts the reply (data reads require it; fault 28 otherwise) |
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
| SessionInfoRequest identity key | long-term enrolled `watchPublicKey` (`store.watchPublicKey`) | `Session.localKey.PublicBytes()` (long-term) | ✅ Match) |
| ECDH key material | long-term enrolled private key (held only by the phone) × `vehicleEcPublicKey`, computed **on the phone** (`BLE_COMPUTE_SHARED_SECRET`); watch caches the resulting key — no on-watch ECDH, no private key, no doublings table | `localKey.ExchangeKey(vehiclePub)` | ✅ Match (same shared secret; just computed phone-side) |
| Session key derivation | `SHA1(shared_x)[:16]` | `SHA1(shared_x)[:16]` | ✅ Match |
| RX reassembly timeout | 1000ms per chunk | 1 second per chunk | ✅ Match |
| HMAC signature type | `SIGNATURE_TYPE_HMAC_PERSONALIZED = 8` in `signature_data` | `SIGNATURE_TYPE_HMAC_PERSONALIZED = 8` | ✅ Match |
| HMAC computation | `subKey=HMAC(sessionKey,"authenticated command")`, tag over metadata + payload | Same | ✅ Match |
| Command payload (field 10) | bare `vcsec.UnsignedMessage` | `proto.Marshal(UnsignedMessage)` → `ProtobufMessageAsBytes` (`getReceiver`) | ✅ Match |
| SessionInfo `clock_time` | parsed as fixed32 LE (wire type 5) | `fixed32 clock_time = 4` | ✅ Match |
| Command terminal detection | FromVCSECMessage (field 10) present; success when no `commandStatus` | `done := commandStatus == nil` (`executeRKEAction`) | ✅ Match |
| `RoutableMessage.flags` | unset (`FLAG_USER_COMMAND`) → plaintext responses | `DefaultFlags = FLAG_ENCRYPT_RESPONSE` | ⚠️ Intentional: we read plaintext replies; we don't implement response decryption |
| SessionInfo tag verification | `subKey=HMAC(sessionKey,"session info")`, tag over TLV(sigType=HMAC, VIN, uuid) + encodedInfo | Same | ✅ Match |
| Outgoing uuid → RoutableMessage field | 51 (`uuid`) — vehicle uses this as SessionInfo HMAC challenge | 51 (`message.Uuid`) per `dispatcher.go` | ✅ Match) |
| CCCD value | `0x0200` (indications) | Subscribe abstracted by Go BLE lib | ✅ Correct |
| GATT discovery | `mstBuildProfile({ pair: true, ... })` — service/char/descriptor topology declared explicitly, mirrors `@silver-zepp/easy-ble` shape | Full discovery (Tesla firmware compat handled at lower level) | ✅ Correct for ZeppOS |
| Chunk write size | Fixed 20 bytes, paced (`BLE_CHUNK_INTERVAL_MS`) | `min(negotiatedMTU, 1024) - 3` | ⚠️ Forced, not a choice: link is ATT MTU 23 (20B payload) with no API to raise it; pacing tuned to the observed link cadence to avoid dropped unacked writes |
| MTU negotiation | None — no API exists | `ExchangeMTU()` before first write | ❌ ZeppOS exposes no MTU or connection-param API; link fixed at 23, peer chunks at 20 too (see MTU Note) |
| Intermediate acks | Handled defensively | Not mentioned (transparent at lower level) | ✅ Harmless |

### MTU Note

**There is no MTU lever on ZeppOS — this was confirmed both ways.** The `@zeppos/device-types` definitions for `@zos/ble` list every `mst*` function and include no MTU or connection-parameter call; `mstConnect(addr, cb)` takes no options. The `mstSetMTU(247, …)` the code used to call was never a real function — device logs show `[BLE] mstSetMTU not available: not a function`. It has been removed.

Empirically the link runs at the BLE default **ATT MTU 23 = 20-byte payload**, and the peer is too: the vehicle returned its 177-byte SessionInfo as **nine 20-byte notifications** (`RX notification: 20 bytes ×8` + `19 bytes`). So 20-byte chunking (`BLE_CHUNK_SIZE = 20`) is forced, not a tunable, and the single-write fast path was deleted (a sub-20B frame is simply a one-chunk send).

The inter-chunk delay `BLE_CHUNK_INTERVAL_MS` (instance-tunable via `chunkIntervalMs`) is paced to the observed per-packet link cadence (~90 ms/packet on device): these are unacked `WRITE_WITHOUT_RESPONSE` writes, so outrunning the link silently drops a chunk → the car gets a truncated request and never replies (the intermittent "ambient-only" failure).

Note the real cost this imposes: that ~90 ms cadence × 9 packets ≈ 0.8 s *just to receive SessionInfo*. A larger MTU would collapse that to ~one connection interval — which is exactly why it would be worth having — but neither MTU nor the connection interval is reachable from the app. It's a hard platform ceiling, not a missing optimization.

### BLE transport: easy-ble wrapper (sole implementation)

`session.js` and `pairing.js` both import from `lib/tesla-ble/ble.js`, the wrapper around `@silver-zepp/easy-ble`'s `BLEMaster`. This is the path validated on device — the only BLE transport in the tree.

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

**Symptom:** Pair flow worked first try (it scans). Subsequent app opens / unlock attempts kept timing out with `[BLE] Connection timeout (5000ms)` and zero `mstConnect` callbacks — the raw ZeppOS `mstConnect(savedMAC, cb)` never fired its callback, neither success nor failure.

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

The watch sends its **long-term enrolled public key** (`store.watchPublicKey`) in
`SessionInfoRequest.publicKey` — the same key the vehicle whitelisted at pairing, matching Tesla's
Go SDK `Session.localKey` (one long-term keypair for both whitelist identity and ECDH). The **private
key lives only on the phone** (companion `settingsStorage`), which performs the ECDH
(`BLE_COMPUTE_SHARED_SECRET`) — QuickJS has no BigInt, and `SessionInfoRequest` needs only the public
half. If the vehicle returns `SessionInfo { status: 1 }` (`KEY_NOT_ON_WHITELIST`), `session.js`
disconnects immediately and surfaces "re-pair required" rather than holding the vehicle's slot until
its supervision timeout.

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

## Session key (phone-computed ECDH, cached)

The session key is a constant for a paired watch+vehicle — `sha1(ECDH(watchPriv, vehiclePub))[:16]` —
because both keys are long-term and static (per-session freshness rides in the epoch/counter/clock of
each message's HMAC, not in the key). So:

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

## Future Work

Open items in the infotainment domain (the `_infotainmentCommand` path already handles the session,
key, encryption, and reply filtering — only the actions/response walkers are missing):

- **Climate** — wire `buildHvacAutoAction()` to the UI (builder exists in `protocol/carserver.js`),
  plus reading `getClimateState`
- **More `GetVehicleData` groups** — `ClosuresState`, `DriveState`, `TirePressureState`,
  `SoftwareUpdateState`; each is one getter flag + one `parse*` walker
- **Re-enable charge status in the UI** — the read path is built; it's disabled while VCSEC owns the
  single BLE response slot
- **Perf (optional)** — cache the per-session AES key schedule + GHASH `H` across commands

## File Structure

```
amazla_key/
├── app.js                        # App entry — creates messageBuilder + KiezelPay (kpay) instances
├── page/
│   ├── index.js                  # Main UI — single screen: car state image + lock/unlock/trunk/frunk;
│   │                             #   routes to pairing if !isPaired; starts KiezelPay purchase if unlicensed;
│   │                             #   Reset/unpair button (createModal confirm)
│   ├── components/               # [pf] screen-type components (round .r / square .s)
│   │   ├── status.[rs].layout.js     # curved-text connection status arc (Connecting/Connected/…)
│   │   ├── connecting.[rs].layout.js # dim veil + IMG_ANIM spinner over the cached car
│   │   └── battery.[rs].layout.js     # charge arc / text (infotainment; currently disabled in UI)
│   ├── pairing/
│   │   ├── index.js              # Pairing flow page (setup → ready → pair → nfc → success)
│   │   └── components/           # Slide + [pf] PairButton
│   ├── kpay/
│   │   └── index.page.js         # KiezelPay purchase dialog (pushed by the kpay lib)
│   └── tesla-mock.js             # SIM-only backend stub (the real lib OOMs the simulator)
├── shared/
│   └── kpay-config.js            # KiezelPay product id + trialEnabled/testMode (testMode OFF for release)
├── app-side/
│   └── index.js                  # Companion service — BLE key/ECDH RPCs, KiezelPay app-side, RESET (unpair)
├── setting/
│   └── index.js                  # Companion settings page (vehicle name + VIN entry)
├── ../zeppify/                   # Shared micro-framework: keepScreenOn, vibro (unified v1/v2/v3 vibrator)
├── lib/
│   ├── phone.js                  # Phone class — IPC wrapper for companion app methods
│   ├── tesla.js                  # High-level Tesla API (lock/unlock/status facade)
│   └── tesla-ble/
│       ├── README.md             # Module-level design notes
│       ├── pairing.js            # createPairingController — headless pairing state machine
│       ├── ble.js                # Low-level BLE — @silver-zepp/easy-ble wrapper. Sole transport; imported by session.js and pairing.js; validated end-to-end on device.
│       ├── ble-name.js           # computeTeslaBLEName(vin) → 'S' + sha1(vin)[:8] hex + 'C'. Mirrors Tesla Go SDK VehicleLocalName. Used by scan-by-name on every connect (MAC rotates every ~15 min).
│       ├── session.js            # Session mgmt (cached keys, signing, commands, d3 path)
│       ├── infotainment.js       # buildAesGcmCommand — AES-GCM RoutableMessage assembly (domain 3)
│       ├── index.js              # Tesla BLE API (high-level wrapper)
│       ├── crypto/
│       │   ├── p256.js           # P-256 (ecdhFixed — kept for the equivalence test)
│       │   ├── sha256.js         # SHA-256 / SHA-1
│       │   ├── hmac.js           # HMAC-SHA256
│       │   ├── aes-gcm.js        # Pure-JS AES-128-GCM (gcmEncrypt/gcmDecrypt) — verified vs Node
│       │   └── binary-utils.js   # Hex / binary-string helpers
│       └── protocol/
│           ├── protobuf.js       # Protobuf encoding/decoding
│           ├── vcsec.js          # Tesla VCSEC message builders/parsers
│           ├── carserver.js      # carserver.Action builders + response parsers (charge port, HVAC, GetChargeState → parseChargeStateResponse, decodeFloat32LE)
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

## State caching

The car can take 10–20 s to answer on connect (a dozing vehicle ignores `GET_STATUS` until
[woken](#rke-actions-remote-keyless-entry); infotainment data is pull-only and never pushed), so
the last-known state is persisted and **painted instantly on app load** while the fresh values
load behind it. One JSON blob (`store.lastVehicleState`), structured by **refresh model, not by
which protocol delivered the field**:

- **VCSEC fields** (`locked`, doors, `sleeping`, `userPresent`) sit **flat** — they're
  *push-driven*: while connected the car streams `VehicleStatus`, so they stay live and need no
  freshness marker.
- **Infotainment data** (`charge: { level, range, state, ts }`) sits in a **nested block with its
  own capture timestamp** — it's *pull-only* (no charge pushes exist), so it can be confidently
  stale and the UI dims a value older than an hour rather than presenting it as current.

`this` (the `Tesla` singleton) is the single in-memory source of truth that both writers update —
`_applyStatus` (VCSEC push) and `_applyChargeState` (charge fetch) — and `_persistState` rebuilds
the blob from it. So the two independent writers **can't clobber each other's fields**
structurally, with no read-modify-write of storage. On load, `_hydrateCachedState` restores both
tiers. Config (name/vin/model) stays in its own discrete LocalStorage keys (write-once at
pairing), and key material stays file-backed (null bytes, re-pair lifecycle) — three tiers by
write-frequency, never mixed.

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
| `lastVehicleState` | Last applied state snapshot — flat VCSEC fields + a nested `charge` block | JSON | Persisted on every applied status / charge fetch; painted instantly on the next app load. See [State caching](#state-caching). |

> **Note**: keys/points with null bytes are stored as **files**, not LocalStorage — null bytes corrupt later LocalStorage writes on ZeppOS (see Binary Files below). `vehicleEcPublicKey` and the cached `sessionKey` are file-backed for this reason; `vehicleEcPublicKey` keeps a one-time legacy LocalStorage fallback so an already-paired watch migrates without re-pairing. (The watch no longer stores a private key.)

### Binary Files (via `@zos/fs`)

| File | Size | Format | Managed By |
|------|------|--------|------------|
| `watch_private_key.dat` | 32 bytes | Raw binary | **Legacy** — the watch no longer stores a private key (it lives only on the phone). Stale files from older installs are purged on reset/re-pair. |
| `vehicle_ec_public_key.dat` | 65 bytes | Raw binary | Vehicle VCSEC EC pubkey from SessionInfo (saved on first connect; the fast-path guard for the cached session key) |
| `session_key.dat` | 16 bytes | Raw `sha1(ECDH)[:16]` symmetric key | derived once via `BLE_COMPUTE_SHARED_SECRET` (phone ECDH), cached |
| `inf_ec_public_key.dat` | 65 bytes | Raw binary | **Infotainment (domain 3)** EC pubkey — a different ECU with its own key pair; the fast-path guard for the d3 key |
| `inf_session_key.dat` | 16 bytes | Raw `sha1(ECDH)[:16]` AES-GCM key | derived once via phone ECDH against the d3 pubkey, cached **after** the d3 SessionInfo tag verifies |

## Setup Guide

### 1. Deploy to Watch & Pair with Tesla

1. Enter the vehicle name + VIN in the companion settings page first (the VIN derives the BLE scan name)
2. Open the app on the watch. An **un-paired watch auto-routes to the pairing page** — with no VIN yet it shows the setup screen ("open the phone app to enter your VIN"); once the VIN syncs it advances to the pair step
3. Tap **Pair** → scans for the Tesla by its VIN-derived name, connects, and initiates enrollment
4. **Tap your NFC keycard** on the car's center console when prompted
5. On success the watch fires an **unlock chirp** to confirm, derives + caches the session key (**"✓ Session key derived — standalone"**), then **Done** returns to the main page ✅

**What happens**: After the whitelist enrollment succeeds, the watch immediately fires a `SessionInfoRequest`. The vehicle's response carries its 65-byte EC public key. The phone (still in range) computes the ECDH and returns the 32-byte shared secret; the watch derives `sha1(secret)[:16]` and caches the session key. That cached key is reused for every future session — the watch is then fully standalone.

### 2. Session crypto (no per-session keys)

The session crypto uses the long-term enrolled key from pairing (matches Tesla Go SDK's `Session.localKey`) — no per-session key, no key pool. The watch holds only the enrolled **public** key (`watchPublicKey`); the **private** key stays on the phone, which computes the ECDH **on the phone** once after pairing (`BLE_COMPUTE_SHARED_SECRET`). The resulting session key is cached on the watch; after that the watch needs no phone.

### 3. Use!

- Open app → main page shows vehicle control (lock/unlock/frunk/trunk) over the cached car state
- Commands auto-establish a BLE session when needed
- Scroll down past the car for the **Reset** button to unpair

**On open** (`page/index.js` `build()`), in order:
1. **Not paired** (`!tesla.isPaired` — enrolled keypair + cached session key) → `replace` to the
   pairing page (setup if no VIN, else ready). Routing uses `isPaired` — a UI decision — so an
   *interrupted* pairing (EC key written but no session) re-enters the flow instead of dead-ending.
   The low-level **connect** gate in `session.js` stays `isEnrolled` (the session key is produced
   *by* connecting, so requiring it there would deadlock the bootstrap).
2. **Unlicensed** (`!kpay.isLicensed()`) → open the KiezelPay purchase dialog (no time-based trial).
3. Otherwise `tesla.connect()` runs; the companion **settings sync is deferred** until the session
   settles so its phone RPC doesn't contend with the car scan/connect on the single BLE radio.

When not online, the main screen shows the last-known (cached) car under the status arc
("Out of range" / "Disconnected") — no action buttons; connection state drives the arc.

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

**Need to re-pair / unpair?**
1. Scroll past the car to the **Reset** button on the main page and confirm
2. This clears the watch storage + live session (`tesla.reset()`) and the phone's settings storage
   (`RESET` RPC), then returns to pairing
3. Also **remove the old key in the Tesla** (Locks menu — the reset can't do this remotely), then pair again

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

- **Tests:** a scripted car simulator (`__tests__/car-simulator.test.js`) covers pairing, session
  setup, and command flows end-to-end against the real protocol code. Run with `npm test`.
- **Simulator UI:** the real BLE/crypto lib OOMs the ZeppOS simulator, so `page/index.js` has a
  backend toggle at the top — comment the real `tesla`/`Phone` imports and uncomment
  `./tesla-mock.js` to develop the UI without a car. Revert before device builds.

### Before release (KiezelPay)

- Set `testMode: false` in [`shared/kpay-config.js`](shared/kpay-config.js) — in test mode purchases
  complete without real payment. (`trialEnabled: false`, so the app opens the purchase dialog on any
  unlicensed launch.)
- Give reviewers a **100% discount code** — the app paywalls immediately (no trial), so without one
  the review can fail at the purchase prompt.

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
