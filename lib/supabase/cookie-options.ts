// Stay signed in for about 90 days. @supabase/ssr defaults to 400 days (the most
// browsers allow); we state our own number explicitly so it is a decision, not an accident.
//
// The cookie is ROLLING: the middleware refreshes the access token (1 hour) on
// visits and re-writes the session cookie with this maxAge each time, so the 90
// days count from the member's last visit, not from sign-in. Someone who opens
// the site at least every 3 months effectively never sees the login screen.
//
// The cookie only lasts as long as the REFRESH TOKEN behind it, so the Supabase
// dashboard must not time-box or expire sessions sooner than this (see docs/pin-login.md).
// Returning devices also have a separate, longer "remember this device" cookie
// (lib/auth/pin-device.ts) so an expired session only costs a PIN.
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export const authCookieOptions = { maxAge: AUTH_COOKIE_MAX_AGE_SECONDS } as const;
