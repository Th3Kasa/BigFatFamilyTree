-- "Remember this device" for PIN sign-in.
--
-- After a successful PIN sign-in the server sets an httpOnly cookie holding a
-- random 256-bit token and stores ONLY the SHA-256 of that token here. A
-- returning device is then asked for just its PIN. Deleting a row revokes that
-- device at once (admin PIN reset, PIN change, sign-out, account deletion).
--
-- Server-only: RLS is on with NO policies, and every privilege is revoked from
-- anon and authenticated, so the browser can never read or write this table.
-- The service role (used by lib/auth/pin-device-store.ts) bypasses RLS.
-- user_agent_hint is a coarse label like "iPhone Safari"; no IP address is stored.

create table if not exists public.pin_devices (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  token_hash      text not null,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz not null default now(),
  user_agent_hint text,
  constraint pin_devices_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint pin_devices_hint_len check (user_agent_hint is null or char_length(user_agent_hint) <= 60)
);

-- Lookup by token hash, and "this member's devices, oldest first" for the 10-device cap.
create unique index if not exists pin_devices_token_hash_uidx on public.pin_devices (token_hash);
create index if not exists pin_devices_profile_last_used_idx on public.pin_devices (profile_id, last_used_at);

alter table public.pin_devices enable row level security;
revoke all on public.pin_devices from public, anon, authenticated;
grant select, insert, update, delete on public.pin_devices to service_role;

comment on table public.pin_devices is 'Remembered devices for PIN sign-in. token_hash = SHA-256 of the cookie token. Service role only; no client policies.';
