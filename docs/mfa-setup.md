# Two-Factor Authentication

Optional, off by default. Enabling it adds a six-digit code from an
authenticator app to the login of anyone who has enrolled.

Nothing here changes for an installation that leaves it switched off.

---

## ⚠️ Before you enable it: check the server clock

**TOTP codes are calculated from the current time and nothing else.** If the
server's clock drifts more than about 30 seconds from real time, every code
from every user is rejected — all at once.

The failure gives no hint of the cause. It reads as *"the codes are wrong"*,
which sends people to reinstall their authenticator app, re-scan the QR code,
and call the helpdesk, while the clock goes unexamined. On a LAN-only server
with no internet access this is a genuinely likely failure.

Check it:

```powershell
# Windows
w32tm /query /status
```

```bash
# Linux
timedatectl status          # expect "System clock synchronized: yes"
```

If time synchronisation is off, turn it on before enabling MFA — not after.

The enrolment page also compares the server's clock against the browser's and
warns if they disagree by more than the validation window, so a drifting server
is usually caught the first time somebody tries to enrol. That is a safety net,
not a substitute for having NTP working.

---

## Turning it on

### 1. Set an encryption key

TOTP secrets are stored encrypted. The key is its own environment variable, not
`SECRET_KEY`:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Put the result in `backend/.env`:

```
MFA_ENCRYPTION_KEY=<the generated key>
```

**It must not be the same value as `SECRET_KEY`.** They are different formats,
and more importantly `SECRET_KEY` is the one key here that may genuinely need
rotating — if TOTP secrets hung off it, rotating it would make every enrolled
factor undecryptable and lock out every user who had set one up.

Restart the backend. Without this key, enrolment fails with a message naming
the variable rather than a stack trace.

> **What the encryption buys, honestly:** it protects a database-only
> disclosure — a stolen backup, a dump pulled through an injection, a
> decommissioned disk. It does nothing against a compromised application host,
> which can read the key and therefore everything it protects.

### 2. Turn on the switch

**Admin → System Settings → Security → Multi-Factor Authentication.**

- **Require a second factor** — the master switch.
- **Roles that must enrol** — leave empty to compel nobody; everyone can still
  opt in.
- **Remember a device for** — how long a browser may skip the code after the
  user ticks *Remember this device*. Set to `0` to require a code at every
  login.
- **Grace period** — recorded, but **not yet enforced**.

**Turning the switch on enrols nobody.** People who have not set up an
authenticator keep signing in with a password alone until they do. Rolling out
to a couple of administrators first is the sensible order.

---

## Enrolling (for users)

**Account menu → Two-Factor Authentication → Set up.**

Enter your password, scan the QR code with an authenticator app (Google
Authenticator, Microsoft Authenticator, FreeOTP, 2FAS — any of them), and type
the six-digit code it shows.

From then on, logging in asks for a code after the password.

### Trusted devices

Ticking *Remember this device* at login lets that browser skip the code until
the trust expires. **Do not tick it on a shared computer.**

The account menu lists every browser currently trusted. That list is the only
place a trusted browser is ever visible, so it is worth glancing at: **an entry
you do not recognise means somebody else's browser can skip your second
factor.** Remove it and tell an administrator.

Signing out a report always asks for a code, trusted device or not.

---

## Losing a device

**There are no printed recovery codes.** This was a deliberate decision: a
printed sheet ends up in a drawer, a wallet, or taped to the monitor, at which
point it is a password written down next to the machine it opens.

Recovery is an administrator who has verified who is asking.

### For the administrator

**Admin → User Management → the user's row → the shield button.**

You will be asked to confirm your own identity first if you have MFA yourself.
The user then signs in with a password alone until they enrol again.

> **Verify who is asking before you click.** With recovery codes gone, that
> check is the whole recovery model — the software cannot perform it and you
> are the one performing it. A phone call from an unknown number asking you to
> clear a pathologist's second factor is exactly the attack this protects
> against.

**Your written procedure should name who is contactable out of hours.** A
pathologist whose phone breaks at 2am cannot sign a frozen section until
somebody answers. `admin` and `lab_manager` can both perform a reset, which
helps, but only if one of them picks up.

### If you are the only administrator

Common in a small lab, where one pathologist is also the administrator. **The
section above does not apply to you**, and it is worth being blunt about why:

- Nobody else can clear your factor, because nobody else holds the role.
- You cannot clear it yourself, because the button is behind a login you can no
  longer complete.

**The console script below is your only way back in.** That makes two things
non-optional rather than advisable:

1. **Run it successfully at least once before you turn MFA on.** Enrol, then
   immediately reset yourself from the console and enrol again. Discovering
   that the script does not run — wrong directory, missing `.env`, no database
   access — at the moment you are locked out is the situation to avoid.
2. **Make sure you can reach the server console without the LIS.** Remote
   Desktop, physical access, whatever it is. If getting to the server itself
   depends on being logged into something that depends on MFA, there is no way
   back at all.

A second administrator account is the other answer, and a reasonable one once
there is a second person to hold it. One account shared between two people is
not — the audit log then cannot say who did anything.

### When nobody can sign in at all

If the last remaining administrator loses their phone, nothing above works:
turning MFA off requires signing in, and signing in requires the factor.

Run this on the server itself:

```bash
cd backend
python scripts/reset_mfa.py --list          # who is enrolled
python scripts/reset_mfa.py <username>      # clear one account
```

Its authorisation is shell access plus database credentials, which is the point
— it has to work when logging in is impossible. It records the reset in the
audit log with **no actor**, because nobody authenticated; a row with no actor
and action `MFA_RESET_VIA_CONSOLE` is the signal that someone went in through
the console.

---

## Rotating the encryption key

`MFA_ENCRYPTION_KEY` accepts several keys separated by commas. The first
encrypts; all of them are tried when decrypting.

```
MFA_ENCRYPTION_KEY=<new key>,<old key>
```

Restart, let people sign in over the following days, then drop the old key.
Removing it too early makes the affected users' factors undecryptable and they
will have to enrol again.

---

## Turning it off

Setting **Require a second factor** to off returns everyone to one-step login
immediately. Nobody is unenrolled and nobody is stranded — it is a real off
switch, and anyone the role policy was compelling is released as well.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Every user's codes are rejected at once | **Server clock drift.** Check NTP first. |
| One user's codes are rejected | Their phone's clock, or they are reading the wrong entry in the app |
| "MFA_ENCRYPTION_KEY is not set" | The key is missing from `backend/.env`, or the backend was not restarted |
| A stored secret could not be decrypted | A key was rotated out too early. Add it back as a trailing entry |
| Code accepted at login but refused immediately after | Expected. A code cannot be reused within its own 30-second step — wait for the next one |
| Administrator gets a 403 on reset | They have MFA themselves and need to confirm their identity; the prompt appears automatically |

---

## What this does not protect against

TOTP is **phishable**. A real-time proxy can relay a code within its 30-second
window, so it defends against a stolen or reused password, not against a
convincing fake login page.

WebAuthn/passkeys are the answer to that and are a documented extension point
rather than a promise. They matter considerably more if this system is ever
exposed beyond the hospital LAN; on a closed network the threat is much smaller.
