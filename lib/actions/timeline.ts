"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkLimit, checkLimitStrict, refundLimit } from "@/lib/ratelimit";
import { DriveError, ensureFolder, safeFileName, startUpload, trashFile } from "@/lib/drive/client";
import { binDeletedPostPhotos } from "@/lib/drive/bin";
import {
  ABANDONED_UPLOAD_MS,
  gigabytes,
  GIVE_UP_UPLOAD_MS,
  isPhotoType,
  MAX_DISPLAY_BYTES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_POST,
  MAX_UPLOAD_BYTES_PER_DAY,
  megabytes,
  POSTABLE_UPLOAD_MS,
  UPLOAD_BUDGET_UNIT,
} from "@/lib/media/limits";
import { parseVideoLink } from "@/lib/media/video";
import { getViewer } from "@/lib/timeline/viewer";

type Result<T = object> = ({ success: true } & T) | { success: false; error: string };

const uuid = z.string().uuid();
const refresh = () => revalidatePath("/person/[id]", "page");

async function approvedViewer() {
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  return { supabase, viewer: viewer?.approved ? viewer : null };
}

// ── Photos ──────────────────────────────────────────────────────────────────

const photoRequest = z.object({
  originalBytes: z.number().int().positive(),
  originalMime: z.string(),
  displayBytes: z.number().int().positive(),
});

/**
 * Step 1 of posting photos: check the limits (up to 5 photos, 15 MB each) and
 * open a Google Drive upload for each original and its timeline copy, all at
 * once. Originals go in People/<person>/ named by date, poster and number;
 * timeline copies in "Timeline copies". The browser then sends the bytes to
 * /api/media/upload/[id].
 */
export async function startPhotoUploads(
  personId: string,
  photos: z.input<typeof photoRequest>[],
): Promise<Result<{ uploads: { original: string; display: string }[] }>> {
  const { supabase, viewer } = await approvedViewer();
  if (!viewer) return { success: false, error: "Please sign in as an approved family member." };
  if (!uuid.safeParse(personId).success) return { success: false, error: "That person isn't on the tree." };
  const parsed = z.array(photoRequest).min(1).max(MAX_PHOTOS_PER_POST).safeParse(photos);
  if (!parsed.success) return { success: false, error: `Choose between 1 and ${MAX_PHOTOS_PER_POST} photos.` };
  for (const p of parsed.data) {
    if (!isPhotoType(p.originalMime)) return { success: false, error: "Photos must be JPEG, PNG, WebP or GIF." };
    if (p.originalBytes > MAX_PHOTO_BYTES) return { success: false, error: `Each photo can be up to ${megabytes(MAX_PHOTO_BYTES)}.` };
    if (p.displayBytes > MAX_DISPLAY_BYTES) return { success: false, error: "That photo couldn't be prepared. Please try another." };
  }
  // Fails closed: without the counter there is nothing between a member and the owner's Drive.
  const [limit, { data: person }] = await Promise.all([
    checkLimitStrict("upload", viewer.userId),
    supabase.from("people").select("id, given_en, family_name_en, given_ar, family_name_ar").eq("id", personId).is("deleted_at", null).maybeSingle(),
  ]);
  if (limit.unavailable) return { success: false, error: "Uploads are paused for a moment. Please try again shortly." };
  if (!limit.success) return { success: false, error: "That's a lot of uploads for one hour. Please try again later." };
  if (!person) return { success: false, error: "That person isn't on the tree." };

  const db = createServiceClient();
  after(() => sweepAbandonedUploads(db));

  // The day's photo budgets, taken atomically before anything starts (parallel
  // requests can't all slip under), and never given back for a discarded upload.
  const requested = parsed.data.reduce((sum, p) => sum + p.originalBytes + p.displayBytes, 0);
  const units = Math.max(1, Math.ceil(requested / UPLOAD_BUDGET_UNIT));
  const mine = await checkLimitStrict("uploadBudget", viewer.userId, units);
  if (mine.unavailable) return { success: false, error: "Uploads are paused for a moment. Please try again shortly." };
  if (!mine.success) {
    // A refused request still used its share; give it back (the cap itself is never passed).
    await refundLimit("uploadBudget", viewer.userId, units);
    return { success: false, error: `You've shared a lot of photos today (up to ${gigabytes(MAX_UPLOAD_BYTES_PER_DAY)} a day). Please try again tomorrow.` };
  }
  const family = await checkLimitStrict("uploadBudgetFamily", "family", units);
  if (!family.success) {
    await Promise.all([
      refundLimit("uploadBudget", viewer.userId, units),
      family.unavailable ? null : refundLimit("uploadBudgetFamily", "family", units),
    ]);
    if (family.unavailable) return { success: false, error: "Uploads are paused for a moment. Please try again shortly." };
    return { success: false, error: "The family has shared a lot of photos today. Please try again tomorrow." };
  }
  const refundBudgets = () =>
    Promise.all([refundLimit("uploadBudget", viewer.userId, units), refundLimit("uploadBudgetFamily", "family", units)]);

  const personName =
    [person.given_en ?? person.given_ar, person.family_name_en ?? person.family_name_ar].filter(Boolean).join(" ").trim() || "Unnamed";
  const stamp = new Date().toISOString().slice(0, 10);
  const batch = randomUUID().slice(0, 6);
  try {
    const [peopleFolder, copiesFolder] = await Promise.all([ensureFolder("people", "People"), ensureFolder("copies", "Timeline copies")]);
    const personFolder = await ensureFolder(`person:${personId}`, personName, peopleFolder);

    const uploads = await Promise.all(
      parsed.data.map(async (p, i) => {
        const ext = p.originalMime.split("/")[1].replace("jpeg", "jpg");
        const n = parsed.data.length > 1 ? ` ${i + 1}` : "";
        const name = safeFileName(`${stamp} ${personName} - from ${viewer.name}${n} (${batch})`);
        const start = async (variant: "original" | "display") => {
          const mime = variant === "original" ? p.originalMime : "image/jpeg";
          const bytes = variant === "original" ? p.originalBytes : p.displayBytes;
          const sessionUrl = await startUpload({
            name: variant === "original" ? `${name}.${ext}` : `${name} (timeline copy).jpg`,
            mime,
            bytes,
            parentId: variant === "original" ? personFolder : copiesFolder,
            appProperties: { bfft: "photo", variant, uploader: viewer.userId, person: personId },
          });
          const { data, error } = await db
            .from("media_uploads")
            .insert({ user_id: viewer.userId, variant, mime, expected_bytes: bytes, session_url: sessionUrl })
            .select("id")
            .single();
          if (error || !data) throw new Error("Couldn't start the upload. Please try again.");
          return data.id as string;
        };
        const [original, display] = await Promise.all([start("original"), start("display")]);
        return { original, display };
      }),
    );
    return { success: true, uploads };
  } catch (e) {
    // Nothing could be uploaded, so nothing was spent.
    await refundBudgets();
    return { success: false, error: e instanceof DriveError || e instanceof Error ? e.message : "Couldn't start the upload. Please try again." };
  }
}

type Db = ReturnType<typeof createServiceClient>;

/**
 * Bin photos that were uploaded but never posted (a closed tab, or someone
 * filling the Drive on purpose), oldest first, a few at a time after each new
 * upload starts. Binned files stay recoverable in the owner's Drive bin for 30
 * days. One Drive keeps refusing to bin is forgotten after a week, so it can't
 * hold up the rest. createPost refuses uploads this old, so a post can't race it.
 */
async function sweepAbandonedUploads(db: Db): Promise<void> {
  const now = Date.now();
  const cutoff = new Date(now - ABANDONED_UPLOAD_MS).toISOString();
  const { data, error } = await db
    .from("media_uploads")
    .select("id, drive_file_id, created_at")
    .lt("created_at", cutoff)
    .order("created_at")
    .limit(25);
  if (error || !data?.length) return;
  const gone: string[] = [];
  for (const u of data) {
    if (!u.drive_file_id || (await trashFile(u.drive_file_id))) gone.push(u.id);
    else if (now - Date.parse(u.created_at) > GIVE_UP_UPLOAD_MS) {
      console.error("[uploads] giving up on binning an abandoned upload:", u.id);
      gone.push(u.id);
    }
  }
  if (gone.length) await db.from("media_uploads").delete().in("id", gone);
}

// ── Posts ───────────────────────────────────────────────────────────────────

export type DatePrecision = "year" | "around" | "decade" | "before" | "after";

const postInput = z.object({
  personId: uuid,
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().max(10000).optional(),
  year: z.number().int().min(1700).max(new Date().getFullYear() + 1).nullable().optional(),
  precision: z.enum(["year", "around", "decade", "before", "after"]).optional(),
  location: z.string().trim().max(200).optional(),
  videoUrl: z.string().trim().max(1000).optional(),
  photos: z
    .array(z.object({ original: uuid, display: uuid, width: z.number().int().positive().max(100000), height: z.number().int().positive().max(100000) }))
    .max(MAX_PHOTOS_PER_POST)
    .optional(),
  tagIds: z.array(uuid).max(30).optional(),
});
export type PostInput = z.input<typeof postInput>;

/** Step 2: create the post (text, date, photos already uploaded, or a video link) and its tags. */
export async function createPost(input: PostInput): Promise<Result<{ postId: string }>> {
  const { supabase, viewer } = await approvedViewer();
  if (!viewer) return { success: false, error: "Please sign in as an approved family member." };
  const parsed = postInput.safeParse(input);
  if (!parsed.success) return { success: false, error: "Something in the post isn't valid. Please check it and try again." };
  const d = parsed.data;
  const photos = d.photos ?? [];

  let video: ReturnType<typeof parseVideoLink> = null;
  if (d.videoUrl) {
    video = parseVideoLink(d.videoUrl);
    if (!video) return { success: false, error: "That link isn't a YouTube, Facebook or Instagram video." };
  }
  if (!d.body && !d.title && photos.length === 0 && !video) return { success: false, error: "Write something, add a photo or paste a video link." };

  const { success: allowed } = await checkLimit("generic", `post:${viewer.userId}`);
  if (!allowed) return { success: false, error: "Please wait a moment before posting again." };

  const { data: person } = await supabase.from("people").select("id").eq("id", d.personId).is("deleted_at", null).maybeSingle();
  if (!person) return { success: false, error: "That person isn't on the tree." };

  // The uploads must be this member's, finished, and the right kinds.
  const db = createServiceClient();
  const uploadIds = photos.flatMap((p) => [p.original, p.display]);
  const uploads = new Map<string, { variant: string; mime: string; expected_bytes: number; drive_file_id: string | null; created_at: string }>();
  if (uploadIds.length) {
    const { data } = await db
      .from("media_uploads")
      .select("id, variant, mime, expected_bytes, drive_file_id, created_at")
      .in("id", uploadIds)
      .eq("user_id", viewer.userId);
    for (const u of data ?? []) uploads.set(u.id, u);
    const oldest = Date.now() - POSTABLE_UPLOAD_MS;
    for (const p of photos) {
      const o = uploads.get(p.original);
      const s = uploads.get(p.display);
      if (!o?.drive_file_id || !s?.drive_file_id || o.variant !== "original" || s.variant !== "display" || s.mime !== "image/jpeg") {
        return { success: false, error: "A photo didn't finish uploading. Please try again." };
      }
      // Older uploads are about to be binned as abandoned.
      if (Date.parse(o.created_at) < oldest || Date.parse(s.created_at) < oldest) {
        return { success: false, error: "These photos were uploaded too long ago. Please add them again." };
      }
    }
  }

  const precision = d.year ? (d.precision ?? "year") : "year";
  const year = d.year ? (precision === "decade" ? Math.floor(d.year / 10) * 10 : d.year) : null;
  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      person_id: d.personId,
      author_id: viewer.userId,
      author_name: viewer.name,
      title: d.title || null,
      body: d.body || null,
      date_value: year ? `${String(year).padStart(4, "0")}-01-01` : null,
      date_precision: precision,
      location: d.location || null,
      video_provider: video?.provider ?? null,
      video_ref: video?.ref ?? null,
      video_url: video?.url ?? null,
    })
    .select("id")
    .single();
  if (error || !post) return { success: false, error: "Couldn't share that. Please try again." };

  if (photos.length) {
    const { error: mediaError } = await db.from("post_media").insert(
      photos.map((p, position) => {
        const o = uploads.get(p.original)!;
        return {
          post_id: post.id,
          position,
          drive_original_id: o.drive_file_id!,
          drive_display_id: uploads.get(p.display)!.drive_file_id!,
          mime: o.mime,
          bytes_original: o.expected_bytes,
          width: p.width,
          height: p.height,
        };
      }),
    );
    if (mediaError) {
      await supabase.rpc("delete_post", { p_post: post.id });
      return { success: false, error: "Couldn't attach the photos. Please try again." };
    }
    await db.from("media_uploads").delete().in("id", uploadIds);
  }

  const tags = [...new Set(d.tagIds ?? [])].filter((id) => id !== d.personId);
  if (tags.length) {
    const { data: real } = await supabase.from("people").select("id").in("id", tags).is("deleted_at", null);
    const ids = (real ?? []).map((r) => r.id);
    if (ids.length) await supabase.from("post_tags").insert(ids.map((person_id) => ({ post_id: post.id, person_id })));
  }

  refresh();
  return { success: true, postId: post.id };
}

/** Give up on photos that were uploaded but never posted. */
export async function discardUploads(uploadIds: string[]): Promise<void> {
  const { viewer } = await approvedViewer();
  const ids = z.array(uuid).max(MAX_PHOTOS_PER_POST * 2).safeParse(uploadIds);
  if (!viewer || !ids.success || ids.data.length === 0) return;
  const db = createServiceClient();
  const { data } = await db.from("media_uploads").select("id, drive_file_id").in("id", ids.data).eq("user_id", viewer.userId);
  for (const u of data ?? []) if (u.drive_file_id) await trashFile(u.drive_file_id);
  await db.from("media_uploads").delete().in("id", ids.data).eq("user_id", viewer.userId);
}

const editInput = z.object({
  title: z.string().trim().max(200),
  body: z.string().trim().max(10000),
  year: z.number().int().min(1700).max(new Date().getFullYear() + 1).nullable(),
  precision: z.enum(["year", "around", "decade", "before", "after"]),
  location: z.string().trim().max(200),
});

/** The author edits their words and date (RLS: author only). */
export async function updatePost(postId: string, input: z.input<typeof editInput>): Promise<Result> {
  const { supabase, viewer } = await approvedViewer();
  const parsed = editInput.safeParse(input);
  if (!viewer || !uuid.safeParse(postId).success || !parsed.success) return { success: false, error: "Couldn't save that change." };
  const d = parsed.data;
  const year = d.year ? (d.precision === "decade" ? Math.floor(d.year / 10) * 10 : d.year) : null;
  const { data, error } = await supabase
    .from("posts")
    .update({
      title: d.title || null,
      body: d.body || null,
      date_value: year ? `${String(year).padStart(4, "0")}-01-01` : null,
      date_precision: year ? d.precision : "year",
      location: d.location || null,
    })
    .eq("id", postId)
    .select("id");
  if (error || !data?.length) return { success: false, error: "Only the person who posted this can edit it." };
  refresh();
  return { success: true };
}

/** Author, profile owner or admin (checked in delete_post). */
export async function deletePost(postId: string): Promise<Result> {
  const { supabase, viewer } = await approvedViewer();
  if (!viewer || !uuid.safeParse(postId).success) return { success: false, error: "Couldn't delete that." };
  const { error } = await supabase.rpc("delete_post", { p_post: postId });
  if (error) return { success: false, error: error.code === "42501" ? "Only the author, the profile owner or an admin can delete this." : "Couldn't delete that." };
  refresh();
  // Move its photos to the Drive bin after replying, so deleting stays instant.
  // Also retries any earlier deletes whose photos Drive couldn't take.
  after(async () => {
    try {
      await binDeletedPostPhotos(20);
    } catch (e) {
      console.error("[drive] binning deleted photos failed:", e instanceof Error ? e.message : e);
    }
  });
  return { success: true };
}

// ── Hearts, comments, tags ──────────────────────────────────────────────────

export async function setHeart(postId: string, on: boolean): Promise<Result> {
  const { supabase, viewer } = await approvedViewer();
  if (!viewer || !uuid.safeParse(postId).success) return { success: false, error: "Couldn't save that." };
  const q = on
    ? supabase.from("post_hearts").upsert({ post_id: postId, user_id: viewer.userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true })
    : supabase.from("post_hearts").delete().eq("post_id", postId).eq("user_id", viewer.userId);
  const { error } = await q;
  if (error) return { success: false, error: "Couldn't save that." };
  return { success: true };
}

export async function addComment(postId: string, body: string): Promise<Result> {
  const { supabase, viewer } = await approvedViewer();
  const text = body.trim();
  if (!viewer || !uuid.safeParse(postId).success) return { success: false, error: "Couldn't post that comment." };
  if (!text || text.length > 2000) return { success: false, error: "Comments can be up to 2,000 characters." };
  const { success: allowed } = await checkLimit("generic", `comment:${viewer.userId}`);
  if (!allowed) return { success: false, error: "Please wait a moment before commenting again." };
  const { error } = await supabase.from("post_comments").insert({ post_id: postId, author_id: viewer.userId, author_name: viewer.name, body: text });
  if (error) return { success: false, error: "Couldn't post that comment." };
  refresh();
  return { success: true };
}

/** Comment author, post author, profile owner or admin (checked in delete_comment). */
export async function deleteComment(commentId: string): Promise<Result> {
  const { supabase, viewer } = await approvedViewer();
  if (!viewer || !uuid.safeParse(commentId).success) return { success: false, error: "Couldn't delete that comment." };
  const { error } = await supabase.rpc("delete_comment", { p_comment: commentId });
  if (error) return { success: false, error: "You can't delete that comment." };
  refresh();
  return { success: true };
}

/** Untag someone: the post's author, the tagged person's owner or an admin (RLS). */
export async function removeTag(postId: string, personId: string): Promise<Result> {
  const { supabase, viewer } = await approvedViewer();
  if (!viewer || !uuid.safeParse(postId).success || !uuid.safeParse(personId).success) return { success: false, error: "Couldn't remove that tag." };
  const { data, error } = await supabase.from("post_tags").delete().eq("post_id", postId).eq("person_id", personId).select("post_id");
  if (error || !data?.length) return { success: false, error: "You can't remove that tag." };
  refresh();
  return { success: true };
}
