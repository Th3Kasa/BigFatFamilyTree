// Stay signed in for about a year. @supabase/ssr defaults to 400 days (the most
// browsers allow); we state one year explicitly so it is a decision, not an accident.
// The cookie only lasts as long as the REFRESH TOKEN behind it, so the Supabase
// dashboard must not time-box or expire sessions sooner (see docs/pin-login.md).
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const authCookieOptions = { maxAge: AUTH_COOKIE_MAX_AGE_SECONDS } as const;
