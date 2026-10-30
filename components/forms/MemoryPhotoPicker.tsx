"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resizeForUpload } from "@/lib/client/resize-image";
import { MAX_MEMORY_PHOTOS } from "@/lib/validation/events";

type Photo = { path: string; preview: string };

type Props = {
  lang: "ar" | "en";
  /** Called with the uploaded storage paths whenever they change. */
  onChange: (paths: string[]) => void;
  disabled?: boolean;
  /** Open the file picker as soon as the form shows ("Upload photos" in the + menu). */
  openOnMount?: boolean;
};

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/**
 * Up to six photos for a memory. Each is shrunk in the browser, then uploaded
 * to photos/memories/<your id>/ (the only folder members may upload to).
 */
export function MemoryPhotoPicker({ lang, onChange, disabled, openOnMount }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (openOnMount) inputRef.current?.click();
  }, [openOnMount]);

  // Free the local previews when the form goes away.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function update(next: Photo[]) {
    setPhotos(next);
    onChange(next.map((p) => p.path));
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    const room = MAX_MEMORY_PHOTOS - photos.length;
    if (files.length > room) setError(t(`You can add up to ${MAX_MEMORY_PHOTOS} photos.`, `يمكنك إضافة ${MAX_MEMORY_PHOTOS} صور كحد أقصى.`));
    const chosen = files.slice(0, Math.max(0, room)).filter((f) => f.type in EXT);
    if (chosen.length === 0) return;

    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(t("Please sign in again.", "يرجى تسجيل الدخول مرة أخرى."));
      setBusy(false);
      return;
    }

    let next = [...photos];
    for (const file of chosen) {
      const blob = await resizeForUpload(file);
      const ext = blob.type === "image/jpeg" ? "jpg" : (EXT[blob.type] ?? "jpg");
      const path = `memories/${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("photos").upload(path, blob, { upsert: false, contentType: blob.type || file.type });
      if (upErr) {
        setError(t("A photo couldn't be uploaded. Please try again.", "تعذّر رفع إحدى الصور. حاول مرة أخرى."));
        continue;
      }
      const preview = URL.createObjectURL(blob);
      previews.current.push(preview);
      next = [...next, { path, preview }];
      update(next);
    }
    setBusy(false);
  }

  async function remove(photo: Photo) {
    update(photos.filter((p) => p.path !== photo.path));
    // Not saved yet, so the file can go straight away (best effort).
    await createClient().storage.from("photos").remove([photo.path]);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-[var(--foreground)]">
        {t("Photos", "صور")} <span className="font-normal text-[var(--muted-foreground)]">{t("(optional)", "(اختياري)")}</span>
      </span>
      <div className="flex flex-wrap gap-2.5">
        {photos.map((p, i) => (
          <div key={p.path} className="relative h-24 w-24 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--muted)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a just-uploaded photo */}
            <img src={p.preview} alt={t(`Photo ${i + 1}`, `الصورة ${i + 1}`)} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p)}
              disabled={disabled || busy}
              aria-label={t(`Remove photo ${i + 1}`, `إزالة الصورة ${i + 1}`)}
              className="absolute end-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        {photos.length < MAX_MEMORY_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[var(--border-strong)] text-xs font-semibold text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ImagePlus className="h-5 w-5" aria-hidden />}
            {busy ? t("Uploading…", "جارٍ الرفع…") : t("Add photos", "أضف صورًا")}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleFiles}
      />
      {error && (
        <p role="alert" className="text-xs text-[var(--destructive)]">
          {error}
        </p>
      )}
    </div>
  );
}
