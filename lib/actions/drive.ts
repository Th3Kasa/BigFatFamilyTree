"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { disconnect } from "@/lib/drive/client";
import { binDeletedPostPhotos } from "@/lib/drive/bin";
import { getViewer } from "@/lib/timeline/viewer";

/** Admins only: stop using Google Drive and revoke the site's access to it. Photos already there stay in the Drive. */
export async function disconnectDrive(): Promise<void> {
  const viewer = await getViewer(await createClient());
  if (!viewer?.isAdmin) throw new Error("Only admins can disconnect Google Drive.");
  await disconnect();
  revalidatePath("/admin");
}

/** Admins only: move photos of deleted posts to the Drive bin (Google empties it after 30 days). */
export async function cleanUpDeletedPhotos(): Promise<void> {
  const viewer = await getViewer(await createClient());
  if (!viewer?.isAdmin) throw new Error("Only admins can clean up photos.");
  const r = await binDeletedPostPhotos(200);
  revalidatePath("/admin");
  redirect(`/admin?drive=${!r.available ? "cleanup-unavailable" : r.remaining > 0 ? "cleaned-partly" : "cleaned"}`);
}
