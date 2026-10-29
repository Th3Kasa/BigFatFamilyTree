import { getLang } from "@/lib/lang/server";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

/** People directory loading screen: header, search and a grid of cards. */
export default async function Loading() {
  const lang = await getLang();
  return (
    <LoadingRegion
      label={lang === "ar" ? "جارٍ تحميل الأشخاص…" : "Loading people…"}
      className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-5 sm:px-6 sm:py-6"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-12 w-full max-w-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-3 py-5">
            <Skeleton className="h-16 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
