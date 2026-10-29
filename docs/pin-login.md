# PIN sign-in for the family

Family members sign in with first name, last name, date of birth and their own 4-digit PIN. No email.
Admins and invited members keep the email sign-in (small "Admins: sign in with email" link).

## How it works

- **Join**: first name, last name, birthday, the 6-digit **family PIN** (shared in the WhatsApp group), and a chosen 4-digit PIN twice. The account is created server-side (`auth.admin.createUser`, placeholder address `m-<uuid>@members.bigfatfamilytree.com.au`, `email_confirm: true`), waits for admin approval, and the member is signed in straight away and sent to `/welcome`.
- **Password**: never the PIN. `base64url(HMAC-SHA256("bff-pin:" + SUPABASE_SERVICE_ROLE_KEY, userId + ":" + pin))`. The PIN is stored nowhere. Rotating `SUPABASE_SERVICE_ROLE_KEY` would invalidate every PIN account's password (admins would have to reset each PIN), so do not rotate it casually.
- **Sign-in**: the server finds the profile by `name_key` + `date_of_birth` + `login_method = 'pin'`, derives the password and calls `signInWithPassword` with the SSR client so session cookies are set normally. Every failure shows one generic message; response time is padded to at least 700 ms.
- **Limits** (Upstash, fail closed for PINs): per account 5 tries per 15 minutes and 10 tries per 24 hours (taken before each attempt, atomically, and cleared by a correct PIN or an admin reset; the 24-hour lock writes a `pin_locked_24h` audit entry); 20 sign-in attempts per IP per 15 minutes; 10 wrong family PINs per IP per hour.
- **Reset PIN** (admins, `/admin/members`): random non-trivial 4-digit temporary PIN shown once; sets `profiles.pin_must_change`; member sees a banner and `/account/pin` ("Change my PIN" in the user menu). A reset also clears the lockout. Admins can reset non-admins; only the super admin can reset an admin.
- **Family PIN card** (super admin): current PIN, Copy, "Make a new family PIN" (only affects new joins), and a ready-to-paste WhatsApp message. The first PIN is generated automatically on first read.

- **Switch an email account to a PIN** (user menu > "Sign in with a PIN instead", `/account/pin/setup`): first/last name and birthday (prefilled) plus a new PIN twice. Server-only, always the caller's own id. Requires an email account whose sign-in is under 24 hours old (otherwise: sign out and use an email link; chosen over asking for the email password because magic-link admins have none). Order: (1) `auth.admin.updateUserById` sets the derived password and `app_metadata.login = 'pin'` + `name_key`, real email untouched; (2) the profile is updated through the service role (`login_method`, names, `name_key`, `date_of_birth`, `pin_must_change = false`). If step 2 fails (including the duplicate-identity unique-index race) step 1 is rolled back: metadata restored, password set to random bytes. The email password stops working; magic link and forgot-password still do, because the email is real.
- **PIN account that forgot its PIN** (only with a real email): `/account/pin` > "Set a new one with an email link" (same `/account/pin/setup` page). Needs a session started by an email link (magic link or reset link) within 15 minutes (checked from the JWT `amr` claim; a PIN sign-in does not count). Name and birthday stay as they are.
- `/update-password` redirects PIN accounts to `/account/pin`, so an email password cannot replace the PIN-derived one by accident.

## Supabase dashboard settings (owner action)

1. **Authentication > Sign In / Providers > Email**: keep **Enable Email provider** and **Allow password sign in** ON. PIN accounts are ordinary password accounts to Supabase. "Confirm email" can stay on (PIN accounts are created already confirmed).
2. **Authentication > Sessions** (stay signed in about a year): leave **"Time-box user sessions" off** and **"Inactivity timeout" off** (both are Pro-plan options; on the free plan sessions already never expire). If either is on, set it to 365 days or more. The refresh token is what keeps people signed in; the cookie lifetime (1 year, set in `lib/supabase/cookie-options.ts`) only matters if the refresh token outlives it.
3. **Authentication > Rate limits**: the "sign-ups and sign-ins" limit is per IP and shared by everyone on one home network; the default (30 per 5 minutes) is fine for a family.
4. JWT expiry can stay at the default 1 hour: the access token refreshes silently.
5. Apply migration `20260523000026_pin_login.sql` BEFORE deploying this code (the members page selects the new columns).
