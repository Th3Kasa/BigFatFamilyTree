"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { FileDown, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildGraphElements, type PersonInput, type RelationshipInput } from "@/lib/graph/transform";
import { PAPERS, PAPER_IDS, fitPoster, legibility, rowCount, recommendedPaper, treeBounds, type Legibility, type PaperId } from "@/lib/print/poster-layout";
import type { PosterProgress } from "@/lib/print/poster-pdf";
import type { TreeExportData } from "@/lib/actions/tree-export";
import { cn } from "@/lib/utils";

type Lang = "ar" | "en";

type Props = {
  lang: Lang;
  onClose: () => void;
  load: () => Promise<TreeExportData>;
  /** Where keyboard focus goes back to when this closes. */
  returnFocusTo?: RefObject<HTMLElement | null>;
};

type Tree = { people: PersonInput[]; relationships: RelationshipInput[] };
type LoadState = { kind: "loading" } | { kind: "error"; reason: "not-linked" | "failed" } | { kind: "ready"; tree: Tree };

const READABILITY: Record<Legibility, { en: string; ar: string; className: string }> = {
  clear: { en: "Names read easily", ar: "الأسماء سهلة القراءة", className: "text-[#2F5A27]" },
  close: { en: "Names read up close", ar: "الأسماء تُقرأ عن قرب", className: "text-[#6A4A1F]" },
  tiny: { en: "Names too small to read in print", ar: "الأسماء أصغر من أن تُقرأ مطبوعة", className: "text-[#7A1631]" },
};

function saveFile(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Long enough for a slow phone to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Picks a paper size (with an honest word on how readable it will be), then builds and saves the PDF. */
export function TreeExportDialog({ lang, onClose, load, returnFocusTo }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [choice, setChoice] = useState<PaperId | null>(null);
  const [progress, setProgress] = useState<PosterProgress | "starting" | null>(null);
  const [failed, setFailed] = useState(false);
  const cancelled = useRef(false);

  const fetchTree = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await load();
      if (cancelled.current) return;
      setState(res.ok ? { kind: "ready", tree: { people: res.people, relationships: res.relationships } } : { kind: "error", reason: res.reason });
    } catch {
      if (!cancelled.current) setState({ kind: "error", reason: "failed" });
    }
  }, [load]);

  useEffect(() => {
    cancelled.current = false;
    // Loading the tree is the point of opening this dialog.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTree();
    return () => {
      cancelled.current = true;
    };
  }, [fetchTree]);

  const tree = state.kind === "ready" ? state.tree : null;
  const sizing = useMemo(() => {
    if (!tree || tree.people.length === 0) return null;
    const { nodes, edges } = buildGraphElements(tree.people, tree.relationships, lang);
    const bounds = treeBounds(nodes, edges);
    const rows = rowCount(nodes);
    return {
      recommended: recommendedPaper(bounds, rows),
      options: PAPER_IDS.map((id) => {
        const fit = fitPoster(bounds, id, rows);
        return { id, orientation: fit.orientation, legibility: legibility(fit) };
      }),
    };
  }, [tree, lang]);
  const paper = choice ?? sizing?.recommended ?? "A1";
  const busy = progress !== null;

  async function generate() {
    if (!tree || busy) return;
    setFailed(false);
    setProgress("starting");
    try {
      const { buildPosterPdf, PosterCancelled } = await import("@/lib/print/poster-pdf");
      try {
        const printedOn = new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
        const result = await buildPosterPdf({
          ...tree,
          lang,
          paper,
          printedOn,
          onProgress: (p) => {
            if (!cancelled.current) setProgress(p);
          },
          cancelled: () => cancelled.current,
        });
        saveFile(result.bytes, `big-fat-family-tree-${paper}.pdf`);
        const note = result.missingPhotos > 0
          ? t(
              ` ${result.missingPhotos} ${result.missingPhotos === 1 ? "photo" : "photos"} couldn't be added, so those cards show initials.`,
              ` تعذّرت إضافة ${result.missingPhotos} من الصور، فتظهر الأحرف الأولى في بطاقاتها.`,
            )
          : "";
        toast.success(t(`Your ${paper} family tree is downloading.${note}`, `جارٍ تنزيل شجرة العائلة بحجم ${paper}.${note}`));
        onClose();
      } catch (e) {
        if (e instanceof PosterCancelled) return;
        throw e;
      }
    } catch (e) {
      console.error("[tree-export] PDF failed:", e);
      if (!cancelled.current) {
        setFailed(true);
        setProgress(null);
      }
    }
  }

  const percent = (() => {
    if (progress === null || progress === "starting") return 2;
    const part = progress.total > 0 ? progress.done / progress.total : 0;
    if (progress.stage === "photos") return 2 + part * 58;
    if (progress.stage === "cards") return 60 + part * 34;
    return 96;
  })();
  // Screen readers hear each stage once; the running count stays on the progress bar.
  const stageLabel = (() => {
    if (progress === null || progress === "starting") return t("Getting started", "جارٍ البدء");
    if (progress.stage === "photos") return t("Adding photos", "إضافة الصور");
    if (progress.stage === "cards") return t("Adding names", "إضافة الأسماء");
    return t("Saving your PDF", "جارٍ حفظ ملف PDF");
  })();
  const progressLabel = (() => {
    if (progress === null || progress === "starting") return t("Getting started…", "جارٍ البدء…");
    if (progress.stage === "photos") return t(`Adding photos: ${progress.done} of ${progress.total}`, `إضافة الصور: ${progress.done} من ${progress.total}`);
    if (progress.stage === "cards") return t(`Adding names: ${progress.done} of ${progress.total}`, `إضافة الأسماء: ${progress.done} من ${progress.total}`);
    return t("Saving your PDF…", "جارٍ حفظ ملف PDF…");
  })();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="max-h-[92svh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-[20px]"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocusTo?.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="pe-8 font-heading text-xl font-bold leading-tight">
            {t("Download the whole family tree", "تنزيل شجرة العائلة كاملة")}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {t(
              "Everyone on one sheet, with their photo and name. Bigger paper makes the names bigger.",
              "الجميع في ورقة واحدة، بصورهم وأسمائهم. كلما كبر حجم الورق كبرت الأسماء.",
            )}
          </DialogDescription>
        </DialogHeader>

        {state.kind === "loading" && (
          <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("Gathering the family…", "جارٍ جمع أفراد العائلة…")}
          </div>
        )}

        {state.kind === "error" && (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl bg-[var(--muted)] p-4 text-sm leading-relaxed text-[var(--foreground)]">
            <p className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
              {state.reason === "not-linked"
                ? t(
                    "Only members linked to their card on the tree can download it. Ask an admin to link your account.",
                    "يمكن للأعضاء المرتبطين ببطاقاتهم في الشجرة فقط تنزيلها. اطلب من أحد المشرفين ربط حسابك.",
                  )
                : t("We couldn't load the family just now. Check your connection and try again.", "تعذّر تحميل العائلة الآن. تحقق من اتصالك وحاول مرة أخرى.")}
            </p>
            {state.reason === "failed" && (
              <button type="button" onClick={() => void fetchTree()} className="inline-flex h-11 items-center rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-5 font-semibold hover:bg-[var(--background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                {t("Try again", "حاول مرة أخرى")}
              </button>
            )}
          </div>
        )}

        {state.kind === "ready" && !sizing && (
          <p className="rounded-2xl bg-[var(--muted)] p-4 text-sm text-[var(--foreground)]">
            {t("There's no one on the tree yet. Add the first person, then come back to print it.", "لا يوجد أحد في الشجرة بعد. أضف أول شخص ثم عد لطباعتها.")}
          </p>
        )}

        {sizing && (
          <>
            <fieldset disabled={busy} className="grid gap-2">
              <legend className="mb-2 text-sm font-semibold text-[var(--foreground)]">{t("Paper size", "حجم الورق")}</legend>
              {sizing.options.map((o) => {
                const on = paper === o.id;
                const read = READABILITY[o.legibility];
                const [short, long] = PAPERS[o.id].mm;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]",
                      on ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border-strong)] hover:bg-[var(--muted)]",
                      busy && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input type="radio" name="paper" value={o.id} checked={on} onChange={() => setChoice(o.id)} className="h-4 w-4 shrink-0 accent-[var(--primary)]" />
                    <span className="w-8 shrink-0 text-base font-bold text-[var(--foreground)]">{o.id}</span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug">
                      <span className="block text-[var(--foreground)]" dir="ltr" style={{ textAlign: lang === "ar" ? "right" : "left" }}>
                        {o.orientation === "landscape" ? `${long} × ${short} mm` : `${short} × ${long} mm`}
                      </span>
                      <span className={cn("block font-semibold", read.className)}>{lang === "ar" ? read.ar : read.en}</span>
                    </span>
                    {o.id === sizing.recommended && (
                      <span className="shrink-0 rounded-full bg-[var(--primary)] px-2.5 py-1 text-[11px] font-bold text-[var(--primary-foreground)]">
                        {t("Best fit", "الأنسب")}
                      </span>
                    )}
                  </label>
                );
              })}
            </fieldset>

            <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
              {t("When you print, choose “Actual size” (100%) so nothing gets cut off.", "عند الطباعة، اختر «الحجم الفعلي» (100%) حتى لا يُقتطع شيء.")}
            </p>

            {failed && (
              <p role="alert" className="flex items-start gap-2 rounded-2xl bg-[var(--muted)] p-3 text-sm text-[var(--foreground)]">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                {t("Something went wrong making the PDF. Please try again.", "حدث خطأ أثناء إنشاء ملف PDF. يرجى المحاولة مرة أخرى.")}
              </p>
            )}

            {busy ? (
              <div className="grid gap-2">
                <p role="status" className="sr-only">{stageLabel}</p>
                <p aria-hidden className="text-sm font-semibold text-[var(--foreground)]">{progressLabel}</p>
                <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-valuetext={progressLabel} aria-label={t("Making your PDF", "جارٍ إنشاء ملف PDF")} className="h-2.5 overflow-hidden rounded-full bg-[var(--muted)]">
                  <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-200" style={{ width: `${percent}%` }} />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void generate()}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-6 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              >
                <FileDown className="h-4 w-4" aria-hidden />
                {t(`Download ${paper} PDF`, `تنزيل PDF بحجم ${paper}`)}
              </button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
