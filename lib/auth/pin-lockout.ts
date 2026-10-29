// Pure lockout rules for PIN sign-in (the counters live in Upstash; see
// lib/auth/pin-session.ts). Kept free of I/O so they are trivially testable.

/** Failed tries allowed per account before it is locked. */
export const PIN_MAX_FAILURES = 5;
/** How long a locked account stays locked. */
export const PIN_LOCK_MINUTES = 15;
/** Sign-in attempts allowed per IP address per window. */
export const PIN_IP_ATTEMPTS = 20;
export const PIN_IP_WINDOW_MINUTES = 15;
/** Family PIN tries allowed per IP address per hour. */
export const FAMILY_PIN_ATTEMPTS = 10;

/** The counter key for one account (name key + birthday; hashed before it reaches Redis). */
export function accountLockKey(nameKey: string, dateOfBirth: string): string {
  return `${nameKey}|${dateOfBirth}`;
}

export type LockState = {
  locked: boolean;
  /** Whole minutes left (at least 1 while locked), 0 when not locked. */
  minutesLeft: number;
};

/**
 * @param remaining failed tries still allowed in the current window
 * @param resetAtMs when the window (and so the lock) ends, epoch milliseconds
 */
export function lockState(remaining: number, resetAtMs: number, nowMs: number): LockState {
  if (remaining > 0 || resetAtMs <= nowMs) return { locked: false, minutesLeft: 0 };
  return { locked: true, minutesLeft: Math.max(1, Math.ceil((resetAtMs - nowMs) / 60_000)) };
}

/** After this failure, will the account be locked? (`remainingAfter` comes from the limiter.) */
export function lockedAfterFailure(remainingAfter: number): boolean {
  return remainingAfter <= 0;
}

/**
 * Sign-in always takes at least this long, whether or not the account exists,
 * so response time does not reveal a valid name + birthday.
 */
export const PIN_MIN_RESPONSE_MS = 700;

export function remainingDelayMs(startedAtMs: number, nowMs: number, floorMs: number = PIN_MIN_RESPONSE_MS): number {
  return Math.max(0, floorMs - (nowMs - startedAtMs));
}
