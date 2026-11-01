import "server-only";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
const { safeFileName } = await import("./client");

describe("Drive file and folder names", () => {
  it("keeps names readable and drops path-like characters", () => {
    expect(safeFileName("2026-11-01 Nassif Mansour - from Basem Morkos 2 (a1b2c3)")).toBe("2026-11-01 Nassif Mansour - from Basem Morkos 2 (a1b2c3)");
    expect(safeFileName("../evil/name\\with:bad*chars?")).toBe(".. evil name with bad chars");
    expect(safeFileName("  lots   of\tspace \n")).toBe("lots of space");
    expect(safeFileName("نصيف منصور")).toBe("نصيف منصور");
    expect(safeFileName("x".repeat(300))).toHaveLength(120);
  });
});
