import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DriveError, sendChunk } from "@/lib/drive/client";
import { isPhotoType, sniffMatches, UPLOAD_CHUNK_BYTES } from "@/lib/media/limits";
import { getViewer } from "@/lib/timeline/viewer";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * One chunk of a photo upload (started by startPhotoUploads). Chunks arrive in
 * order with an "x-chunk-start" header; each is forwarded to the Google Drive
 * session, which only the server knows. The first chunk must really be the
 * image type that was declared.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const { uploadId } = await params;
  if (!UUID_RE.test(uploadId)) return fail("Unknown upload.", 404);

  const viewer = await getViewer(await createClient());
  if (!viewer?.approved) return fail("Please sign in.", 401);

  const db = createServiceClient();
  const { data: row } = await db
    .from("media_uploads")
    .select("id, user_id, mime, expected_bytes, received_bytes, session_url, drive_file_id, created_at")
    .eq("id", uploadId)
    .maybeSingle();
  if (!row || row.user_id !== viewer.userId) return fail("Unknown upload.", 404);
  if (row.drive_file_id) return NextResponse.json({ done: true });
  if (Date.now() - new Date(row.created_at).getTime() > 6 * 60 * 60 * 1000) return fail("This upload expired. Please try again.", 410);

  const start = Number(request.headers.get("x-chunk-start"));
  if (!Number.isInteger(start) || start !== row.received_bytes) {
    return NextResponse.json({ error: "Out of order.", received: row.received_bytes }, { status: 409 });
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > UPLOAD_CHUNK_BYTES) return fail("Chunk too large.", 413);

  const bytes = new Uint8Array(await request.arrayBuffer());
  const end = start + bytes.byteLength;
  const isLast = end === row.expected_bytes;
  if (bytes.byteLength === 0 || bytes.byteLength > UPLOAD_CHUNK_BYTES || end > row.expected_bytes || (!isLast && bytes.byteLength !== UPLOAD_CHUNK_BYTES)) {
    return fail("Bad chunk size.", 400);
  }
  if (start === 0 && (!isPhotoType(row.mime) || !sniffMatches(row.mime, bytes))) {
    return fail("That file isn't a photo we can use (JPEG, PNG, WebP or GIF).", 415);
  }

  try {
    const result = await sendChunk(row.session_url, bytes, start, row.expected_bytes);
    if (result.done) {
      await db.from("media_uploads").update({ received_bytes: row.expected_bytes, drive_file_id: result.fileId }).eq("id", row.id);
      return NextResponse.json({ done: true });
    }
    await db.from("media_uploads").update({ received_bytes: result.received }).eq("id", row.id);
    return NextResponse.json({ done: false, received: result.received });
  } catch (e) {
    const status = e instanceof DriveError ? e.status : 502;
    return fail(e instanceof DriveError ? e.message : "Upload failed. Please try again.", status);
  }
}
