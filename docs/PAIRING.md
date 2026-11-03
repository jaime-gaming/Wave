# Pairing, for any platform

Wave's pairing is deliberately the smallest thing that can link two devices that have never met.
It is written down here because it has to be the same on every platform: a phone running Android,
a desktop running Windows and a tab running the web client must all be able to link to each other,
and none of them may need an account, a server or a shared secret.

The web client is the reference implementation: `src/sync/transport.ts`, `src/sync/signal.ts`,
`src/sync/pairing.ts`, `src/sync/protocol.ts`. Read them in that order.

## The shape of it

1. **Transport.** A WebRTC data channel. Offers, answers and ICE candidates are exchanged **by
   hand**, as text, because there is no signalling server to relay them.
2. **Keys.** Each device has an ephemeral ECDH P-256 key pair for the session. The public keys
   travel inside the handshake text.
3. **Secret.** Both sides derive one AES-GCM 256 key with HKDF-SHA-256, from the shared secret and
   the fixed info string `wave-sync-v1 aes-gcm`. Every frame after that is encrypted with it.
4. **Confirmation.** Both devices show the same six digits, derived from the same material with
   the info string `wave-sync-v1 sas`. A person compares them. This is what stops an active relay
   from substituting its own key: it cannot produce the same six digits.
5. **Frames.** UTF-8 JSON, version `1`, one frame per message on the channel.

## The text that goes between devices

Two kinds of text exist, and they are both plain strings a person can copy and paste — which is
the whole point, since a camera is not always available and a desktop has none.

- **Invite** — `<origin>/#wave-pair=wave1.d.<base64url>` or the bare `wave1.…` payload.
  `d` means the payload is deflated before base64, `p` means plain. The payload is JSON:
  `{ deviceId, name, platform, publicKey, signal }`, where `signal` is the WebRTC offer with its
  gathered candidates.
- **Reply** — the same `wave1.…` format, carrying the answer and the answering device's public
  key.

Limits: 24 000 characters per code, eight seconds of candidate gathering, two minutes before an
invite expires.

## What a new platform has to do

To be linkable, a client needs exactly five things:

1. **Show** an invite: create the key pair, gather a WebRTC offer, put it in `wave1.d.…`, render
   it as a QR code _and_ offer it as text.
2. **Read** an invite, either by scanning the QR, opening the link, or pasting the text.
3. **Answer** it: build the answer, show the same six digits, let the person confirm.
4. **Speak** the frame protocol (`hi`/`hello`, `pair-confirm`, `library-index`, `loan-…`,
   `transfer-…`), encrypted with the derived key.
5. **Remember** the peer's device id and public key, so the next session skips the six digits.

Anything that can open a WebRTC data channel can be a peer. That includes a WebView: a native app
may host `wave.jaime-gaming.com/#devices` and hand the received bytes to its own library, which is
the smallest way for Android and Windows to join the network without porting the cryptography to
two more languages.

## Non-goals

- No accounts, no relay, no cloud library.
- No audio is uploaded anywhere: what moves between two linked devices is the original file, once,
  directly, with its SHA-256 checked at the end.
- No downgrade: a peer that reports a protocol version the other side does not know is refused with
  `unsupported-version` and nothing is written.
