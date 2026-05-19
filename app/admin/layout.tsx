import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <a href="/" className="text-sm text-gray-400 hover:text-gray-600">← Home</a>
        <h1 className="text-lg font-semibold text-gray-900">Admin</h1>
        <nav className="flex gap-4 ms-4">
          <a href="/admin" className="text-sm text-gray-600 hover:text-gray-900">Users</a>
          <a href="/admin/audit" className="text-sm text-gray-600 hover:text-gray-900">Audit Log</a>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
