"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  currentUrl: string | null;
  onUpload: (url: string) => void;
};

export function PhotoUpload({ currentUrl, onUpload }: Props) {
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);

    setPreview(URL.createObjectURL(file));

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;

    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from("photos")
      .upload(path, file, { upsert: false });

    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("photos").getPublicUrl(path);
    onUpload(data.publicUrl);
    setUploading(false);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-dashed border-gray-300 hover:border-amber-400 transition-colors flex items-center justify-center bg-gray-50"
      >
        {preview ? (
          <img src={preview} alt="Photo" className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl">📷</span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-xs">Uploading…</span>
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleChange}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
