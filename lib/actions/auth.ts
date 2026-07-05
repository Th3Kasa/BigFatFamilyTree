"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isBootstrapAdmin } from "@/lib/auth/bootstrap";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function ensureBootstrapUser(email: string): Promise<void> {
  if (!isBootstrapAdmin(email)) return;
  const service = createServiceClient();
  await service.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  // Ignore "already exists" errors — idempotent by design
}
