import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("/signup", () => {
  it("opens the Join the family tab on the sign-in page", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({ source: "/signup", destination: "/login?mode=signup", permanent: false });
  });
});
