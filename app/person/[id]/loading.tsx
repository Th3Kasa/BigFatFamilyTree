import { getLang } from "@/lib/lang/server";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

/** Profile loading screen: cover, avatar, name, family circles and story cards. */
export default async function Loading() {
  const lang = await getLang();
  return (
    <LoadingRegion
      label={lang === "ar" ? "جارٍ تحميل الملف الشخصي…" : "Loading the profile…"}
      className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-3 pb-10 sm:px-5"
    >
      <div className="overflow-hidden rounded-b-[24px] border border-t-0 border-[var(--border)] bg-[var(--card)]">
        <div className="h-[132px] animate-pulse bg-[#EFE3D3] sm:h-[180px]" />
        <div className="flex flex-wrap items-end gap-5 px-4 pb-5 sm:px-7">
          <div className="-mt-16 h-32 w-32 rounded-full border-[5px] border-[var(--card)] bg-[var(--muted)] sm:h-36 sm:w-36" />
          <div className="flex flex-1 flex-col gap-2 pb-2">
            <Skeleton className="h-8 w-60" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
        <div className="flex gap-4 px-4 pb-5 sm:px-7">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="h-16 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
        <div className="flex gap-6 border-t border-[var(--border)] px-5 py-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="h-48 rounded-[20px] border border-[var(--border)] bg-[var(--card)] lg:w-[320px]" />
        <div className="flex flex-1 flex-col gap-3.5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
