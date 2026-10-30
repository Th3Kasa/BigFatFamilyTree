"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { embedUrl, posterUrl, PROVIDER_NAME, type VideoProvider } from "@/lib/media/video";

/**
 * A video from YouTube, Facebook or Instagram. Nothing is loaded from those
 * sites until someone taps play, so the page stays fast and visitors aren't
 * tracked by them just for opening a profile.
 */
export function VideoEmbed({ provider, videoRef, url, lang }: { provider: VideoProvider; videoRef: string; url: string; lang: "ar" | "en" }) {
  const [playing, setPlaying] = useState(false);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const src = embedUrl(provider, videoRef);
  const poster = posterUrl(provider, videoRef);
  const name = PROVIDER_NAME[provider];
  const tall = provider === "instagram";

  if (!src) return null;
  return (
    <div>
      <div className={tall ? "relative mx-auto aspect-[4/5] max-h-[620px] w-full max-w-[420px] bg-[#2C2C2A]" : "relative aspect-video w-full bg-[#2C2C2A]"}>
        {playing ? (
          <iframe
            src={src}
            title={t(`${name} video`, `فيديو ${name}`)}
            className="absolute inset-0 h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-2 text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
            aria-label={t(`Play the ${name} video`, `تشغيل فيديو ${name}`)}
          >
            {poster && (
              // eslint-disable-next-line @next/next/no-img-element -- YouTube still, loaded lazily
              <img src={poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80" />
            )}
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-[#241517] shadow-lg transition-transform group-hover:scale-105">
              <Play className="ms-1 h-7 w-7" aria-hidden />
            </span>
            <span className="relative rounded-full bg-black/55 px-3 py-1 text-[13px] font-semibold">{t(`Tap to play · ${name}`, `اضغط للتشغيل · ${name}`)}</span>
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2 text-[13px] text-[var(--muted-foreground)]">
        {provider !== "youtube" && (
          <span>{t("Only public videos can play here.", "يمكن تشغيل الفيديوهات العامة فقط هنا.")}</span>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-[var(--primary)] hover:underline">
          <ExternalLink className="h-4 w-4" aria-hidden />
          {t(`Open on ${name}`, `افتح على ${name}`)}
        </a>
      </div>
    </div>
  );
}
