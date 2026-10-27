// Smoke test for every app route, run through the text-only runner:
//   node scripts/pw.mjs --script scripts/smoke-routes.mjs
// SITE_URL overrides the target (default: production). Signed-out visitors
// should get 200 everywhere, with protected routes redirecting to /login.
// Hitting /login also exercises the Upstash rate limiter.

const BASE = (process.env.SITE_URL || "https://bigfatfamilytree.vercel.app").replace(/\/$/, "");

const ROUTES = [
  "/",
  "/login",
  "/update-password",
  "/admin",
  "/admin/audit",
  "/transcripts",
  "/transcripts/new",
  "/person/new",
  "/person/00000000-0000-0000-0000-000000000000",
  "/does-not-exist",
  "/icon.png",
  "/apple-icon.png",
  "/opengraph-image.png",
];

export default async ({ page, log, fail }) => {
  let bad = 0;
  for (const route of ROUTES) {
    const errors = [];
    const onPageError = (e) => errors.push(`pageerror: ${e.message}`);
    const onResponse = (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);

    let status;
    try {
      const res = await page.goto(BASE + route);
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      status = res?.status() ?? 0;
    } catch (e) {
      status = 0;
      errors.push(e.message.split("\n")[0]);
    }
    page.off("pageerror", onPageError);
    page.off("response", onResponse);

    const final = new URL(page.url()).pathname;
    const ok = status > 0 && status < 500 && errors.length === 0;
    if (!ok) bad++;
    log(`${ok ? "OK  " : "FAIL"} ${status || "ERR"} ${route}${final !== route ? ` -> ${final}` : ""}`);
    for (const e of [...new Set(errors)].slice(0, 3)) log(`       ${e.slice(0, 200)}`);
  }
  if (bad) fail(`${bad} of ${ROUTES.length} routes failing on ${BASE}`);
  return `${ROUTES.length - bad}/${ROUTES.length} routes OK on ${BASE}`;
};
