import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Birth order set by hand (people.birth_order), as id → position (1 = oldest).
 * Fetched on its own so the pages keep working, with the old name/date order,
 * if the birth_order migration has not been applied yet: any error yields an
 * empty map instead of failing the whole people query.
 */
export async function fetchBirthOrders(supabase: Supabase): Promise<Map<string, number>> {
  try {
    const { data, error } = await supabase.from("people").select("id, birth_order").not("birth_order", "is", null).is("deleted_at", null);
    if (error || !data) return new Map();
    return new Map(data.flatMap((r) => (r.birth_order == null ? [] : [[r.id, r.birth_order] as const])));
  } catch {
    return new Map();
  }
}

/** Attach birth_order (null when not set) to each person row. */
export function withBirthOrder<T extends { id: string }>(rows: T[], orders: Map<string, number>): (T & { birth_order: number | null })[] {
  return rows.map((p) => ({ ...p, birth_order: orders.get(p.id) ?? null }));
}
