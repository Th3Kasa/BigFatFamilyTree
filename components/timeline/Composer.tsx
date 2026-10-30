"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, ImagePlus, Link2, Loader2, X } from "lucide-react";
import { createPost, discardUploads, startPhotoUploads, type DatePrecision } from "@/lib/actions/timeline";
import { isPhotoType, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_POST, megabytes } from "@/lib/media/limits";
import { makeDisplayCopy, uploadInChunks } from "@/lib/media/upload-client";
import { parseVideoLink, PROVIDER_NAME } from "@/lib/media/video";
import { DateFields, parseYear } from "./DateFields";
import { TagPicker } from "./TagPicker";
import type { TimelinePerson } from "./Timeline";

type Picked = { file: File; preview: string };

/**
 * "Share a memory of …": text, up to 5 photos (15 MB each), or a video link,
 * with an optional date, place and tagged relatives. Posts appear straight away.
 */
export function Composer({
  personId,
  firstName,
  viewerName,
  people,
  photosEnabled,
  lang,
}: {
  personId: string;
  firstName: string;
  viewerName: string;
  people: TimelinePerson[];
  photosEnabled: boolean;
  lang: "ar" | "en";
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const router = useRouter();
  const bodyId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [showVideo, setShowVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [year, setYear] = useState("");
  const [precision, setPrecision] = useState<DatePrecision>("year");
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Free the preview images when the form closes.
  const previews = useRef<Picked[]>([]);
  useEffect(() => {
    previews.current = photos;
  }, [photos]);
  useEffect(() => () => previews.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const video = videoUrl.trim() ? parseVideoLink(videoUrl) : null;
  const videoInvalid = showVideo && videoUrl.trim().length > 0 && !video;

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...photos];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_PHOTOS_PER_POST) {
        setError(t(`You can add up to ${MAX_PHOTOS_PER_POST} photos in one post.`, `يمكنك إضافة ${MAX_PHOTOS_PER_POST} صور كحد أقصى في المنشور الواحد.`));
        break;
      }
      if (!isPhotoType(file.type)) {
        setError(t(`${file.name} isn't a JPEG, PNG, WebP or GIF photo.`, `${file.name} ليست صورة JPEG أو PNG أو WebP أو GIF.`));
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setError(t(`${file.name} is over ${megabytes(MAX_PHOTO_BYTES)}. Each photo can be up to ${megabytes(MAX_PHOTO_BYTES)}.`, `${file.name} أكبر من ${megabytes(MAX_PHOTO_BYTES)}. الحد الأقصى لكل صورة ${megabytes(MAX_PHOTO_BYTES)}.`));
        continue;
      }
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    setPhotos(next);
    setShowVideo(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function reset() {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setBody("");
    setPhotos([]);
    setVideoUrl("");
    setShowVideo(false);
    setShowDetails(false);
    setYear("");
    setPrecision("year");
    setLocation("");
    setTags([]);
    setError(null);
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (videoInvalid) return setError(t("That link isn't a YouTube, Facebook or Instagram video.", "هذا الرابط ليس فيديو من يوتيوب أو فيسبوك أو إنستغرام."));
    if (!body.trim() && photos.length === 0 && !video) return setError(t("Write something, add a photo or paste a video link.", "اكتب شيئًا أو أضف صورة أو الصق رابط فيديو."));
    if (year && !parseYear(year)) return setError(t("Enter a 4-digit year, like 1975.", "أدخل سنة من 4 أرقام، مثل 1975."));

    let uploadIds: string[] = [];
    try {
      const uploaded: { original: string; display: string; width: number; height: number }[] = [];
      if (photos.length) {
        setBusy(t("Preparing photos…", "جارٍ تجهيز الصور…"));
        const copies = await Promise.all(photos.map((p) => makeDisplayCopy(p.file)));
        const started = await startPhotoUploads(
          photos.map((p, i) => ({ originalBytes: p.file.size, originalMime: p.file.type, displayBytes: copies[i].blob.size })),
        );
        if (!started.success) throw new Error(started.error);
        uploadIds = started.uploads.flatMap((u) => [u.original, u.display]);
        const total = photos.reduce((s, p, i) => s + p.file.size + copies[i].blob.size, 0);
        let done = 0;
        const report = (n: number) => setBusy(t(`Uploading photos… ${Math.round((n / total) * 100)}%`, `جارٍ رفع الصور… ${Math.round((n / total) * 100)}%`));
        for (let i = 0; i < photos.length; i++) {
          const before = done;
          await uploadInChunks(started.uploads[i].display, copies[i].blob, (n) => report(before + n));
          done += copies[i].blob.size;
          const mid = done;
          await uploadInChunks(started.uploads[i].original, photos[i].file, (n) => report(mid + n));
          done += photos[i].file.size;
          uploaded.push({ original: started.uploads[i].original, display: started.uploads[i].display, width: copies[i].width, height: copies[i].height });
        }
      }
      setBusy(t("Sharing…", "جارٍ النشر…"));
      const res = await createPost({
        personId,
        body: body.trim() || undefined,
        year: parseYear(year),
        precision,
        location: location.trim() || undefined,
        videoUrl: video ? videoUrl.trim() : undefined,
        photos: uploaded,
        tagIds: tags,
      });
      if (!res.success) throw new Error(res.error);
      uploadIds = [];
      toast.success(t("Shared on the timeline", "تمت المشاركة في الخط الزمني"));
      reset();
      router.refresh();
    } catch (err) {
      if (uploadIds.length) void discardUploads(uploadIds);
      setError(err instanceof Error && err.message ? err.message : t("Couldn't share that. Please try again.", "تعذّرت المشاركة. حاول مرة أخرى."));
    } finally {
      setBusy(null);
    }
  }

  const pill =
    "inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50";
  const field =
    "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card)] px-3 text-[15px] focus-visible:border-[var(--ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

  return (
    <form onSubmit={submit} className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-4" aria-label={t(`Share a memory of ${firstName}`, `شارك ذكرى عن ${firstName}`)}>
      <label htmlFor={bodyId} className="sr-only">
        {t(`Share a memory of ${firstName}`, `شارك ذكرى عن ${firstName}`)}
      </label>
      <textarea
        id={bodyId}
        dir="auto"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => setOpen(true)}
        maxLength={10000}
        rows={open ? 4 : 1}
        placeholder={t(`Share a memory of ${firstName}…`, `شارك ذكرى عن ${firstName}…`)}
        className={`${field} resize-y rounded-2xl bg-[var(--input)] px-4 py-3 leading-relaxed`}
      />

      {photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label={t("Photos to share", "الصور المختارة")}>
          {photos.map((p, i) => (
            <li key={p.preview} className="relative aspect-square overflow-hidden rounded-xl bg-[var(--muted)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img src={p.preview} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  URL.revokeObjectURL(p.preview);
                  setPhotos(photos.filter((_, k) => k !== i));
                }}
                aria-label={t(`Remove photo ${i + 1}`, `إزالة الصورة ${i + 1}`)}
                className="absolute end-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showVideo && (
        <div className="mt-3">
          <label className="mb-1 block text-[13px] font-semibold text-[var(--foreground)]" htmlFor={`${bodyId}-video`}>
            {t("Video link", "رابط الفيديو")}
          </label>
          <input
            id={`${bodyId}-video`}
            type="url"
            inputMode="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtu.be/…"
            className={`${field} h-11`}
            aria-invalid={videoInvalid}
          />
          <p className={`mt-1 text-[13px] ${videoInvalid ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"}`}>
            {video
              ? t(`${PROVIDER_NAME[video.provider]} video found.`, `تم العثور على فيديو ${PROVIDER_NAME[video.provider]}.`)
              : videoInvalid
                ? t("Paste a YouTube, Facebook or Instagram video link.", "الصق رابط فيديو من يوتيوب أو فيسبوك أو إنستغرام.")
                : t("YouTube, Facebook or Instagram. Private videos can't play here; on YouTube, “unlisted” works.", "يوتيوب أو فيسبوك أو إنستغرام. لا يمكن تشغيل الفيديوهات الخاصة هنا؛ في يوتيوب يعمل خيار «غير مدرج».")}
          </p>
        </div>
      )}

      {showDetails && (
        <div className="mt-3 grid gap-3">
          <DateFields year={year} precision={precision} onYear={setYear} onPrecision={setPrecision} lang={lang} />
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-[var(--foreground)]" htmlFor={`${bodyId}-where`}>
              {t("Where? (optional)", "أين؟ (اختياري)")}
            </label>
            <input id={`${bodyId}-where`} dir="auto" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder={t("Alexandria", "الإسكندرية")} className={`${field} h-11`} />
          </div>
          <TagPicker people={people} value={tags} onChange={setTags} lang={lang} excludeId={personId} />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-[var(--destructive)]">
          {error}
        </p>
      )}

      {(open || photos.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            type="button"
            className={pill}
            disabled={!!busy || !photosEnabled || photos.length >= MAX_PHOTOS_PER_POST || (showVideo && !!videoUrl)}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
            {t(`Photos (${photos.length}/${MAX_PHOTOS_PER_POST})`, `صور (${photos.length}/${MAX_PHOTOS_PER_POST})`)}
          </button>
          <button type="button" className={pill} disabled={!!busy || photos.length > 0} onClick={() => setShowVideo((v) => !v)} aria-expanded={showVideo}>
            <Link2 className="h-4 w-4" aria-hidden />
            {t("Video link", "رابط فيديو")}
          </button>
          <button type="button" className={pill} disabled={!!busy} onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails}>
            <Calendar className="h-4 w-4" aria-hidden />
            {t("Date, place, people", "التاريخ والمكان والأشخاص")}
          </button>
          <div className="ms-auto flex items-center gap-2">
            <button type="button" className={pill} disabled={!!busy} onClick={reset}>
              {t("Cancel", "إلغاء")}
            </button>
            <button
              type="submit"
              disabled={!!busy}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {busy ?? t("Share", "نشر")}
            </button>
          </div>
          {!photosEnabled && (
            <p className="w-full text-[13px] text-[var(--muted-foreground)]">
              {t("Photo uploads switch on once an admin connects Google Drive.", "يتاح رفع الصور بعد أن يربط أحد المشرفين Google Drive.")}
            </p>
          )}
          <p className="w-full text-[13px] text-[var(--muted-foreground)]">
            {t(`Posting as ${viewerName}. Up to ${MAX_PHOTOS_PER_POST} photos, ${megabytes(MAX_PHOTO_BYTES)} each. Only approved family can see it.`, `تنشر باسم ${viewerName}. حتى ${MAX_PHOTOS_PER_POST} صور، ${megabytes(MAX_PHOTO_BYTES)} لكل صورة. يراها أفراد العائلة المعتمدون فقط.`)}
          </p>
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {busy ?? ""}
      </p>
    </form>
  );
}
