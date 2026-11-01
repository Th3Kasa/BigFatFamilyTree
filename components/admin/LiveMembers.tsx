"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { Lang } from "@/lib/lang/server";
import type { LiveSnapshot } from "@/lib/presence/live";
import { LIVE_POLL_MS, agoLabel, pageLabel } from "@/lib/presence/rules";
import { Initials, cardClass, pill } from "@/components/members/primitives";

type State =
  | { kind: "loading" }
  | { kind: "ready"; snapshot: LiveSnapshot; error: boolean }
  | { kind: "error" };

/** The admin Live list: polls /api/admin/live while the tab is visible. */
export function LiveMembers({ lang }: { lang: Lang }) {
  const t = useCallback((en: string, ar: string) => (lang === "ar" ? ar : en), [lang]);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/live", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const snapshot = (await res.json()) as LiveSnapshot;
      setState({ kind: "ready", snapshot, error: false });
    } catch {
      // Keep showing the last good list, marked as out of date.
      setState((s) => (s.kind === "ready" ? { ...s, error: true } : { kind: "error" }));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // First load from a callback, like every later poll.
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, LIVE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const refreshButton = (
    <button type="button" onClick={() => void load()} disabled={refreshing} className={pill.outline}>
      <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
      {t("Refresh now", "حدّث الآن")}
    </button>
  );

  if (state.kind === "loading") {
    return (
      <div className={`${cardClass} p-2`} aria-busy="true">
        <p className="sr-only" role="status">
          {t("Loading who is online…", "جارٍ تحميل المتصلين…")}
        </p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3" aria-hidden>
            <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[#F4EDEA] motion-reduce:animate-none" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-3.5 w-2/5 animate-pulse rounded bg-[#F4EDEA] motion-reduce:animate-none" />
              <span className="h-3 w-1/4 animate-pulse rounded bg-[#F4EDEA] motion-reduce:animate-none" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div role="alert" className={`${cardClass} flex flex-col items-start gap-3 border-[#F6D3BC] bg-[#FFF4EC] p-4 text-sm text-[#9A3412]`}>
        <div>
          <p className="font-bold">{t("Couldn't load who is online.", "تعذّر تحميل المتصلين.")}</p>
          <p className="mt-1">
            {t("The live service may be busy. It will try again on its own.", "قد تكون الخدمة مشغولة. ستعيد المحاولة تلقائيًا.")}
          </p>
        </div>
        {refreshButton}
      </div>
    );
  }

  const { snapshot, error } = state;
  const count = snapshot.members.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[15px] font-semibold" role="status" aria-live="polite">
          <span
            className={`h-2.5 w-2.5 rounded-full ${count > 0 ? "bg-[#2F7D32]" : "bg-[#B9AAA6]"}`}
            aria-hidden
          />
          {count === 0
            ? t("No one online right now", "لا أحد متصل الآن")
            : count === 1
              ? t("1 member online", "عضو واحد متصل")
              : t(`${count} members online`, `${count} أعضاء متصلون`)}
        </p>
        {refreshButton}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-[#FFF4EC] px-3 py-2 text-sm text-[#9A3412]">
          {t("Couldn't refresh. Showing the last list we got.", "تعذّر التحديث. نعرض آخر قائمة وصلتنا.")}
        </p>
      ) : null}

      {count === 0 ? (
        <div className={`${cardClass} p-6 text-center`}>
          <p className="font-semibold">{t("It's quiet for now.", "الهدوء يعمّ الآن.")}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {t(
              "Members show up here within a minute of opening the site.",
              "يظهر الأعضاء هنا خلال دقيقة من فتحهم الموقع.",
            )}
          </p>
        </div>
      ) : (
        <ul className={`${cardClass} divide-y divide-[#ECE2DE]`}>
          {snapshot.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 p-3 sm:p-4">
              <Initials name={m.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {m.name}
                  {m.isYou ? <span className="font-normal text-[var(--muted-foreground)]"> {t("(you)", "(أنت)")}</span> : null}
                </p>
                <p className="truncate text-sm text-[var(--muted-foreground)]">
                  {m.path ? (
                    <Link
                      href={m.path}
                      className="underline-offset-4 hover:text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      {pageLabel(m.path, t)}
                    </Link>
                  ) : (
                    pageLabel(null, t)
                  )}
                </p>
              </div>
              <span className="shrink-0 text-sm text-[var(--muted-foreground)]">
                {agoLabel(m.lastSeen, snapshot.now, t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
