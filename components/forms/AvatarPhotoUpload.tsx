"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { updatePersonPhoto } from "@/lib/actions/people";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

type Props = {
  personId: string;
  currentUrl: string | null;
  alt: string;
  initials: string;
  fallbackGender?: "m" | "f" | "unknown";
  sizeClass?: string;
  wrapperClassName?: string;
  fallbackClassName?: string;
  lang?: "ar" | "en";
};

export function AvatarPhotoUpload({
  personId,
  currentUrl,
  alt,
  initials,
  fallbackGender,
  sizeClass = "h-14 w-14",
  wrapperClassName = "ring-2 ring-border",
  fallbackClassName = "text-base font-semibold bg-muted",
  lang = "en",
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticUrl, setOptimisticUrl] = useState<string | null>(currentUrl);
  const [, startTransition] = useTransition();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setBusy(true);
    const blobUrl = URL.createObjectURL(file);
    setOptimisticUrl(blobUrl);

    const ext = MIME_TO_EXT[file.type] ?? "jpg";
    const path = `${personId}/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();

    const { error: upErr } = await supabase.storage
      .from("photos")
      .upload(path, file, { upsert: false });

    if (upErr) {
      setError(upErr.message);
      setOptimisticUrl(currentUrl);
      setBusy(false);
      URL.revokeObjectURL(blobUrl);
      return;
    }

    const { data } = supabase.storage.from("photos").getPublicUrl(path);
    const publicUrl = data.publicUrl;

    const result = await updatePersonPhoto(personId, publicUrl);
    URL.revokeObjectURL(blobUrl);

    if (!result.success) {
      setError(result.error ?? "Save failed");
      setOptimisticUrl(currentUrl);
      setBusy(false);
      return;
    }

    setOptimisticUrl(publicUrl);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  const tip =
    lang === "ar"
      ? optimisticUrl
        ? "تغيير الصورة"
        : "إضافة صورة"
      : optimisticUrl
        ? "Change photo"
        : "Add photo";

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={tip}
        title={tip}
        className={cn(
          "group relative rounded-full transition-shadow",
          wrapperClassName,
          busy ? "cursor-wait" : "cursor-pointer hover:ring-[var(--primary)]/70",
        )}
      >
        <Avatar className={cn("shrink-0", sizeClass)}>
          {optimisticUrl && (
            <AvatarImage src={optimisticUrl} alt={alt} className="object-cover" />
          )}
          <AvatarFallback className={fallbackClassName}>
            {initials || (fallbackGender === "f" ? "♀" : "♂")}
          </AvatarFallback>
        </Avatar>

        <span
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full flex items-center justify-center",
            "bg-black/45 text-white opacity-0 transition-opacity",
            busy ? "opacity-100" : "group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleFile}
      />

      {error && (
        <p className="text-[10px] leading-tight text-destructive max-w-[10rem]">{error}</p>
      )}
    </div>
  );
}
