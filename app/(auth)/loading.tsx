/**
 * Sign-in and password pages render quickly; keep the root tree skeleton
 * (app/loading.tsx) from flashing here with a plain warm screen instead.
 */
export default function Loading() {
  return <div aria-hidden className="min-h-svh bg-[var(--background)]" />;
}
