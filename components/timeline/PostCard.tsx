"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Heart, MessageCircle, MoreHorizontal, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEventDate } from "@/lib/people/display";
import { addComment, deleteComment, deletePost, removeTag, setHeart, updatePost, type DatePrecision } from "@/lib/actions/timeline";
import { canDeleteComment, canDeletePost, canRemoveTag, type TimelinePost, type TimelineViewer } from "@/lib/timeline/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateFields, parseYear } from "./DateFields";
import { VideoEmbed } from "./VideoEmbed";
import type { TimelinePerson } from "./Timeline";

/** "3 days ago" / "منذ 3 أيام". */
export function timeAgo(iso: string, lang: "ar" | "en", now = Date.now()): string {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of steps) if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  return rtf.format(0, "minute");
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

export function PostCard({
  post,
  viewer,
  profilePersonId,
  people,
  lang,
}: {
  post: TimelinePost;
  viewer: TimelineViewer;
  profilePersonId: string;
  people: Map<string, TimelinePerson>;
  lang: "ar" | "en";
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const router = useRouter();
  const commentId = useId();
  const [pending, start] = useTransition();
  const [hearted, setHearted] = useState(post.hearted);
  const [hearts, setHearts] = useState(post.hearts);
  const [showComments, setShowComments] = useState(post.comments.length > 0 && post.comments.length <= 3);
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);

  const isAuthor = post.authorId === viewer.userId;
  const mayDelete = canDeletePost(post, viewer, profilePersonId);
  const date = formatEventDate(post.dateValue, post.datePrecision, lang);
  const elsewhere = post.personId !== profilePersonId ? people.get(post.personId) : null;
  const action = post.media.length
    ? t(post.media.length === 1 ? "added a photo" : `added ${post.media.length} photos`, post.media.length === 1 ? "أضاف صورة" : `أضاف ${post.media.length} صور`)
    : post.video
      ? t("shared a video", "شارك فيديو")
      : t("shared a memory", "شارك ذكرى");

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.success) toast.error(r.error ?? t("Something went wrong.", "حدث خطأ ما."));
      else {
        if (ok) toast.success(ok);
        router.refresh();
      }
    });

  function toggleHeart() {
    const next = !hearted;
    setHearted(next);
    setHearts((h) => h + (next ? 1 : -1));
    start(async () => {
      const r = await setHeart(post.id, next);
      if (!r.success) {
        setHearted(!next);
        setHearts((h) => h + (next ? -1 : 1));
        toast.error(r.error);
      }
    });
  }

  function sendComment(e: React.FormEvent) {
    e.preventDefault();
    const text = comment.trim();
    if (!text) return;
    run(async () => {
      const r = await addComment(post.id, text);
      if (r.success) setComment("");
      return r;
    });
  }

  const iconBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
  const barBtn =
    "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

  return (
    <article className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)]" aria-label={t(`Post by ${post.authorName}`, `منشور من ${post.authorName}`)}>
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[13px] font-bold text-[var(--primary)]">
          {initials(post.authorName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-[var(--foreground)]">
            <span className="font-bold">{post.authorName}</span> <span className="text-[var(--muted-foreground)]">{action}</span>
            {elsewhere && (
              <span className="text-[var(--muted-foreground)]">
                {" "}
                {t("on", "على صفحة")} <span className="font-semibold text-[var(--foreground)]">{elsewhere.name}</span>
                {t("'s profile", "")}
              </span>
            )}
          </p>
          <p className="text-[13px] text-[var(--muted-foreground)]">
            {[date, post.location, timeAgo(post.createdAt, lang), post.edited ? t("edited", "معدّل") : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {(isAuthor || mayDelete) && (
          <DropdownMenu dir={lang === "ar" ? "rtl" : "ltr"}>
            <DropdownMenuTrigger asChild>
              <button type="button" className={iconBtn} aria-label={t("Post options", "خيارات المنشور")} disabled={pending}>
                <MoreHorizontal className="h-5 w-5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isAuthor && <DropdownMenuItem onSelect={() => setEditing(true)}>{t("Edit post", "تعديل المنشور")}</DropdownMenuItem>}
              {mayDelete && (
                <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-[var(--destructive)] focus:text-[var(--destructive)]">
                  {t("Delete post", "حذف المنشور")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {editing ? (
        <EditForm post={post} lang={lang} onDone={() => setEditing(false)} />
      ) : (
        (post.title || post.body) && (
          <div className="px-4 pb-3">
            {post.title && <h3 className="text-lg font-bold text-[var(--foreground)]">{post.title}</h3>}
            {post.body && (
              <p dir="auto" className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#3D2B2E]">
                {post.body}
              </p>
            )}
          </div>
        )
      )}

      {post.media.length > 0 && <PhotoGrid post={post} lang={lang} />}
      {post.video && <VideoEmbed provider={post.video.provider} videoRef={post.video.ref} url={post.video.url} lang={lang} />}

      {post.tagIds.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-4 pt-3" aria-label={t("People in this post", "الأشخاص في هذا المنشور")}>
          {post.tagIds.map((pid) => {
            const p = people.get(pid);
            if (!p) return null;
            return (
              <li key={pid} className="inline-flex items-center rounded-full bg-[var(--primary-soft)] text-[13px] font-semibold text-[var(--primary)]">
                <a href={`/person/${encodeURIComponent(p.slug ?? p.id)}`} className="rounded-full px-3 py-1.5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                  {p.name}
                </a>
                {canRemoveTag(post, pid, viewer) && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => removeTag(post.id, pid), t("Tag removed", "تمت إزالة الوسم"))}
                    aria-label={t(`Remove the tag for ${p.name}`, `إزالة وسم ${p.name}`)}
                    className="-ms-1.5 me-0.5 flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mx-4 mt-3 flex border-t border-[var(--border)] py-1">
        <button type="button" onClick={toggleHeart} aria-pressed={hearted} className={cn(barBtn, hearted && "text-[var(--primary)]")}>
          <Heart className={cn("h-5 w-5", hearted && "fill-current")} aria-hidden />
          <span>{hearts > 0 ? hearts : t("Heart", "أعجبني")}</span>
          <span className="sr-only">{t(hearted ? "(you hearted this)" : "", hearted ? "(أعجبك)" : "")}</span>
        </button>
        <button type="button" onClick={() => setShowComments((v) => !v)} aria-expanded={showComments} aria-controls={commentId} className={barBtn}>
          <MessageCircle className="h-5 w-5" aria-hidden />
          {post.comments.length > 0
            ? t(`${post.comments.length} comment${post.comments.length === 1 ? "" : "s"}`, `${post.comments.length} تعليق`)
            : t("Comment", "تعليق")}
        </button>
      </div>

      {showComments && (
        <div id={commentId} className="flex flex-col gap-2 px-4 pb-4">
          {post.comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[11px] font-bold text-[var(--foreground)]">
                {initials(c.authorName)}
              </span>
              <div className="min-w-0 flex-1 rounded-2xl bg-[var(--muted)] px-3 py-2">
                <p className="text-[13px] font-bold text-[var(--foreground)]">
                  {c.authorName} <span className="font-normal text-[var(--muted-foreground)]">· {timeAgo(c.createdAt, lang)}</span>
                </p>
                <p dir="auto" className="whitespace-pre-wrap text-[15px] text-[var(--foreground)]">
                  {c.body}
                </p>
              </div>
              {canDeleteComment(c, post, viewer, profilePersonId) && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteComment(c.id), t("Comment deleted", "تم حذف التعليق"))}
                  aria-label={t(`Delete ${c.authorName}'s comment`, `حذف تعليق ${c.authorName}`)}
                  className={iconBtn}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          ))}
          <form onSubmit={sendComment} className="flex items-center gap-2">
            <label htmlFor={`${commentId}-input`} className="sr-only">
              {t("Write a comment", "اكتب تعليقًا")}
            </label>
            <input
              id={`${commentId}-input`}
              dir="auto"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              placeholder={t("Write a comment…", "اكتب تعليقًا…")}
              className="h-11 min-w-0 flex-1 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-4 text-[15px] focus-visible:border-[var(--ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
            <button
              type="submit"
              disabled={pending || !comment.trim()}
              className="inline-flex min-h-11 items-center rounded-full bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {t("Post", "نشر")}
            </button>
          </form>
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle>{t("Delete this post?", "حذف هذا المنشور؟")}</DialogTitle>
            <DialogDescription>
              {t("It disappears from every timeline it's on, with its hearts and comments.", "سيختفي من كل الصفحات التي يظهر فيها، مع الإعجابات والتعليقات.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="inline-flex min-h-11 items-center rounded-full border border-[var(--border-strong)] px-4 text-sm font-semibold">
              {t("Keep it", "إبقاء")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setConfirmDelete(false);
                run(() => deletePost(post.id), t("Post deleted", "تم حذف المنشور"));
              }}
              className="inline-flex min-h-11 items-center rounded-full bg-[var(--destructive)] px-4 text-sm font-bold text-white hover:opacity-90"
            >
              {t("Delete post", "حذف المنشور")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function PhotoGrid({ post, lang }: { post: TimelinePost; lang: "ar" | "en" }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const n = post.media.length;
  const grid = n === 1 ? "grid-cols-1" : n === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3";
  return (
    <ul className={cn("grid gap-0.5 bg-[var(--border)]", grid)}>
      {post.media.map((m, i) => {
        // One photo is shown whole (never cropped) and no taller than about
        // half a laptop screen; it centres on a soft background. Several
        // photos form a grid of square crops.
        const single = n === 1;
        return (
          <li key={m.id} className={cn("relative bg-[var(--muted)]", n === 3 && i === 0 && "col-span-2 sm:col-span-1")}>
            <a
              href={`/api/media/${m.id}/original`}
              target="_blank"
              rel="noopener"
              className={cn(
                "block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
                single && "flex justify-center",
              )}
              aria-label={t(`Open photo ${i + 1} of ${n} at full size`, `فتح الصورة ${i + 1} من ${n} بالحجم الكامل`)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private photo served by /api/media */}
              <img
                src={`/api/media/${m.id}/display`}
                alt=""
                loading="lazy"
                decoding="async"
                width={m.width ?? undefined}
                height={m.height ?? undefined}
                style={single ? undefined : { aspectRatio: "1 / 1" }}
                className={single ? "h-auto max-h-[min(65vh,560px)] w-auto max-w-full object-contain" : "w-full object-cover"}
              />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function EditForm({ post, lang, onDone }: { post: TimelinePost; lang: "ar" | "en"; onDone: () => void }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState(post.body ?? "");
  const [year, setYear] = useState(post.dateValue ? post.dateValue.slice(0, 4) : "");
  const [precision, setPrecision] = useState<DatePrecision>(
    (["year", "around", "decade", "before", "after"] as const).includes(post.datePrecision as DatePrecision) ? (post.datePrecision as DatePrecision) : "year",
  );
  const [location, setLocation] = useState(post.location ?? "");
  const [error, setError] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (year && !parseYear(year)) return setError(t("Enter a 4-digit year, like 1975.", "أدخل سنة من 4 أرقام، مثل 1975."));
    start(async () => {
      const r = await updatePost(post.id, { title: post.title ?? "", body, year: parseYear(year), precision, location });
      if (!r.success) return setError(r.error);
      toast.success(t("Post updated", "تم تحديث المنشور"));
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="grid gap-3 px-4 pb-3">
      <label className="sr-only" htmlFor={`edit-${post.id}`}>
        {t("Post text", "نص المنشور")}
      </label>
      <textarea
        id={`edit-${post.id}`}
        dir="auto"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={10000}
        className="w-full resize-y rounded-2xl border border-[var(--border-strong)] bg-[var(--card)] px-4 py-3 text-[15px] focus-visible:border-[var(--ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
      <DateFields year={year} precision={precision} onYear={setYear} onPrecision={setPrecision} lang={lang} />
      <input
        dir="auto"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        maxLength={200}
        aria-label={t("Where", "المكان")}
        placeholder={t("Where? (optional)", "أين؟ (اختياري)")}
        className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card)] px-3 text-[15px] focus-visible:border-[var(--ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--destructive)]">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="inline-flex min-h-11 items-center rounded-full border border-[var(--border-strong)] px-4 text-sm font-semibold">
          {t("Cancel", "إلغاء")}
        </button>
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60">
          {t("Save", "حفظ")}
        </button>
      </div>
    </form>
  );
}
