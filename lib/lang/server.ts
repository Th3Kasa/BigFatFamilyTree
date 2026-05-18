import { cookies } from "next/headers";

export type Lang = "ar" | "en";

export function parseLang(value: string | undefined): Lang {
  return value === "ar" ? "ar" : "en";
}

export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return parseLang(store.get("lang")?.value);
}
