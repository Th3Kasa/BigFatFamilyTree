import { getLang } from "@/lib/lang/server";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

/** Home (and default) loading screen: the tree header and canvas panel. */
export default async function Loading() {
  const lang = await getLang();
  return (
    <LoadingRegion
      label={lang === "ar" ? "جارٍ تحميل شجرة العائلة…" : "Loading the family tree…"}
      className="flex h-[calc(100svh-var(--topbar-h)-var(--tabbar-h))] flex-col gap-3 p-3 md:gap-4 md:px-6 md:py-5"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56 md:h-8" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="grid grid-cols-3 gap-x-10 gap-y-16 opacity-80">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="flex h-[150px] w-[132px] flex-col items-center gap-3 rounded-2xl border border-[var(--border)] p-4 sm:w-[160px]"
              >
                <Skeleton className="h-14 w-14" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
