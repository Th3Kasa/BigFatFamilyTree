"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { disconnect } from "@/lib/drive/client";
import { getViewer } from "@/lib/timeline/viewer";

/** Admins only: stop using Google Drive and revoke the site's access to it. Photos already there stay in the Drive. */
export async function disconnectDrive(): Promise<void> {
  const viewer = await getViewer(await createClient());
  if (!viewer?.isAdmin) throw new Error("Only admins can disconnect Google Drive.");
  await disconnect();
  revalidatePath("/admin");
}
