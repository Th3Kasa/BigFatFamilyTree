import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { downloadFile, DriveError } from "@/lib/drive/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A timeline photo, fetched from Google Drive for an approved member.
 * variant "display" is the timeline copy; "original" the full-quality file
 * (add ?download=1 to save it). The row is read with the member's own session,
 * so RLS decides access: signed-out visitors, unapproved members and deleted
 * posts get a 404. The browser keeps its own private copy for a week.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ mediaId: string; variant: string }> }) {
  const { mediaId, variant } = await params;
  if (!UUID_RE.test(mediaId) || (variant !== "display" && variant !== "original")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data: media } = await supabase
    .from("post_media")
    .select("id, drive_original_id, drive_display_id, mime")
    .eq("id", mediaId)
    .maybeSingle();
  if (!media) return new NextResponse("Not found", { status: 404 });

  const etag = `"${media.id}-${variant}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { etag, "cache-control": "private, max-age=604800, immutable" } });
  }

  try {
    const file = await downloadFile(variant === "original" ? media.drive_original_id : media.drive_display_id);
    const type = variant === "display" ? "image/jpeg" : media.mime;
    const ext = type.split("/")[1].replace("jpeg", "jpg");
    const headers = new Headers({
      "content-type": type,
      "cache-control": "private, max-age=604800, immutable",
      etag,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="family-photo-${media.id.slice(0, 8)}.${ext}"`,
    });
    const length = file.headers.get("content-length");
    if (length) headers.set("content-length", length);
    return new NextResponse(file.body, { status: 200, headers });
  } catch (e) {
    const status = e instanceof DriveError && e.status === 404 ? 404 : 502;
    return new NextResponse(status === 404 ? "Not found" : "Photo temporarily unavailable", { status, headers: { "cache-control": "no-store" } });
  }
}
