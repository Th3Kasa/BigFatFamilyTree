import { describe, expect, it } from "vitest";
import {
  EMAIL_FROM,
  SITE_URL,
  approvedEmail,
  escapeHtml,
  newRequestEmail,
  newSuggestionEmail,
  siteLink,
} from "@/lib/notify/payloads";
import { envSchema } from "@/lib/env";

describe("notification payloads", () => {
  it("sends from the branded sender", () => {
    expect(EMAIL_FROM).toBe("Big Fat Family <noreply@bigfatfamilytree.com.au>");
  });

  it("'You're in!' links to the tour on the production site", () => {
    const mail = approvedEmail({ name: "Omar Haddad" });
    expect(mail.subject).toBe("You're in! Come and explore the family tree");
    expect(mail.html).toContain(`href="${SITE_URL}/?tour=1"`);
    expect(mail.html).toContain("#7A1631");
    expect(mail.text).toContain(`${SITE_URL}/?tour=1`);
    expect(mail.html).toContain("Welcome, Omar");
  });

  it("works without a name and in Arabic (right-to-left)", () => {
    expect(approvedEmail({ name: null }).html).toContain("Come and explore the family tree.");
    const ar = approvedEmail({ name: "عمر حداد", lang: "ar" });
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.html).toContain("أنت الآن في العائلة!");
    expect(ar.html).toContain("/?tour=1");
  });

  it("tells admins about a new request, with a link to Members", () => {
    const mail = newRequestEmail({ memberName: "Maya Khoury", claimedPerson: "Maya Khoury" });
    expect(mail.subject).toBe("Maya Khoury is waiting for access");
    expect(mail.text).toContain("says they are Maya Khoury");
    expect(mail.html).toContain(`href="${SITE_URL}/admin/members"`);
  });
  it("handles a request from someone who isn't in the tree", () => {
    expect(newRequestEmail({ memberName: "Maya", claimedPerson: null }).text).toContain("isn't in the tree yet");
  });

  it("tells admins about a suggested relative", () => {
    const mail = newSuggestionEmail({ memberName: "Maya", relativeName: "Dina Haddad", relation: "aunt" });
    expect(mail.subject).toBe("Maya suggested a relative: Dina Haddad");
    expect(mail.text).toContain("Dina Haddad (aunt)");
  });

  it("escapes member-supplied text in the HTML (no injection) and strips header-breaking newlines", () => {
    const mail = newSuggestionEmail({
      memberName: "<script>alert(1)</script>",
      relativeName: 'Evil"><img src=x>',
      relation: "a\r\nBcc: attacker@example.com",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img");
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });

  it("only links to our own site", () => {
    expect(siteLink("/x")).toBe(`${SITE_URL}/x`);
    expect(siteLink("x")).toBe(`${SITE_URL}/x`);
  });
});

describe("RESEND_API_KEY is optional", () => {
  const required = {
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "t",
  };
  it("passes without it", () => expect(envSchema.safeParse(required).success).toBe(true));
  it("passes with an empty value (counts as unset)", () =>
    expect(envSchema.safeParse({ ...required, RESEND_API_KEY: "" }).success).toBe(true));
  it("passes with a key", () => expect(envSchema.safeParse({ ...required, RESEND_API_KEY: "re_123" }).success).toBe(true));
});
