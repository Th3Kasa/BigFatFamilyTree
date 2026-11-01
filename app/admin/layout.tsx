import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/members/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Same gate as every admin page and action (role "admin" or the owner).
  if (!(await getAdminContext())) redirect("/");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">← Home</Link>
        <h1 className="text-lg font-semibold text-gray-900">Admin</h1>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 sm:ms-4">
          <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">Users</Link>
          <Link href="/admin/members" className="text-sm text-gray-600 hover:text-gray-900">Members</Link>
          <Link href="/admin/live" className="text-sm text-gray-600 hover:text-gray-900">Live</Link>
          <Link href="/admin/audit" className="text-sm text-gray-600 hover:text-gray-900">Audit Log</Link>
        </nav>
      </header>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</div>
    </div>
  );
}
