import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, photoStoragePath } from "@/lib/storage/photo-path";
import { PHOTO_SIZES, type PhotoSize } from "@/lib/storage/sign";
import { resizeForDisplay } from "@/lib/media/resize";

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store" } });

/**
 * A profile photo from the private `photos` bucket, at avatar size.
 * /api/photo?p=<path in bucket>&w=<128|384|1024>
 *
 * Read with the member's own session, so storage RLS (photos_approved_read)
 * decides: signed-out visitors and unapproved members get a 404. The address
 * never changes for a given photo (uploads never overwrite a path), so the
 * browser keeps its own private copy for a week instead of re-downloading the
 * photo on every page, as it had to with hourly signed links.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const path = photoStoragePath(params.get("p"));
  const w = Number(params.get("w") ?? 384) as PhotoSize;
  if (!path || /^https?:/i.test(params.get("p") ?? "") || !PHOTO_SIZES.includes(w)) return notFound();

  const etag = `"${path}-${w}"`;
  const cache = "private, max-age=604800, immutable";
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { etag, "cache-control": cache } });

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) return notFound();

  const bytes = new Uint8Array(await data.arrayBuffer());
  const out = await resizeForDisplay(bytes, data.type || "image/jpeg", w);
  return new NextResponse(out.body, {
    status: 200,
    headers: {
      "content-type": out.type,
      "content-length": String(out.body.byteLength),
      "cache-control": cache,
      etag,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
