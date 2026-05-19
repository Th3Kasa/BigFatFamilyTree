"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  onUpload: (path: string) => void;
};

const ACCEPTED = "audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,audio/aac";

export function AudioUpload({ onUpload }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    setFileName(file.name);

    const ext = file.name.split(".").pop() ?? "mp3";
    const path = `${crypto.randomUUID()}.${ext}`;

    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from("audio")
      .upload(path, file, { upsert: false });

    if (upErr) {
      setError(upErr.message);
      setFileName(null);
      setUploading(false);
      return;
    }

    onUpload(path);
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-amber-400 transition-colors bg-gray-50 hover:bg-amber-50 text-sm text-gray-600"
      >
        <span className="text-2xl">🎙️</span>
        <span>
          {uploading
            ? "Uploading…"
            : fileName
              ? fileName
              : "Click to upload audio file"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={handleChange}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
