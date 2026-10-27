---
description: Run browser automation, scraping or UI checks with the text-only Playwright runner (no MCP, no screenshots). Pass a URL and/or what to do.
argument-hint: <url> [what to check or do]
---

Use the project's text-only Playwright runner, `scripts/pw.mjs`, for this task:

$ARGUMENTS

## Rules
- Run it with Bash: `node scripts/pw.mjs ...` (or `npm run pw -- ...`). Never use a Playwright/browser MCP server for this.
- One task = one command where possible. Batch every step into a single `--steps` or `--script` run instead of many small invocations.
- Read the stdout text report directly. It contains URL, HTTP status, title, cleaned page text, page errors, console errors/warnings and failed requests, ending in `Result: PASS|FAIL`. Exit code 1 = FAIL.
- **No screenshots** unless the user asks for one or a layout or visual bug can't be diagnosed from text. Only then add `--screenshot <file>` and Read the PNG.
- Keep output small: use `--select <css>` to scope the text, `--max <n>` to cap it and `--no-text` when only status and errors matter.
- Put temporary step files and scripts in the session scratchpad directory, not in the repo.
- Never type real passwords or secrets into steps. For pages behind login, ask the user to sign in once with `--headed --save-storage .auth/state.json` (this file is gitignored), then reuse it with `--storage .auth/state.json`.
- Vercel preview URLs are behind Vercel login. Get a share link first (Vercel MCP `get_access_to_vercel_url`) and visit that URL as the first step.

## Modes

**1. Read one page**
```bash
node scripts/pw.mjs https://example.com --select main --max 2000
```

**2. Multi-step task: JSON array, inline or as a file path.** Each step has one action key:
`goto`, `click`, `fill` + `value`, `press` (+ optional `on`), `select` + `value`, `check`, `hover`, `wait` (css or ms), `waitForUrl`, `text` (css or ""), `expectText` (+ optional `in`), `expectUrl`, `eval` (JS expression), `screenshot`.
```bash
node scripts/pw.mjs http://localhost:3000/login --steps '[
  {"fill":"input[type=email]","value":"test@example.com"},
  {"click":"button[type=submit]"},
  {"wait":"[role=status]"},
  {"expectText":"Check your email"}
]'
```
A failed action (click, fill, goto…) stops the run. Failed `expect*` checks are marked FAIL and the run continues, so one run reports every check. Either way the result is `FAIL`.

**3. Custom Playwright code**, for loops, branching or anything the step list can't express. Write a temporary `.mjs` file in the scratchpad:
```js
// <scratchpad>/check.mjs
export default async ({ page, context, log, fail, extractText }) => {
  for (const path of ["/", "/login"]) {
    const res = await page.goto("http://localhost:3000" + path);
    log(res.status(), path, await page.title());
    if (res.status() >= 500) fail(`${path} returned ${res.status()}`);
  }
  return await extractText("main"); // optional: printed after the logs
};
```
```bash
node scripts/pw.mjs --script "<scratchpad>/check.mjs"
```
`fail(msg)` marks the run FAIL without stopping it. Collected console, page and network errors are appended automatically. A reusable example is `scripts/smoke-routes.mjs` (checks every app route; `SITE_URL` env overrides the target).

**4. Crawl a site** to check every same-origin page it links to (skips `/_*` internals and static files):
```bash
node scripts/pw.mjs --crawl http://localhost:3000 --limit 40
```
Prints one `OK`/`FAIL` line per page with status, redirects and errors.

## Other options
`--wait <css|ms>`, `--mobile` (375px iPhone viewport), `--timeout <ms>`, `--headed`, `--storage <file>`, `--save-storage <file>`, `--screenshot <file>`.

## Reporting back
Summarise the result for the user in plain language: what passed, what failed and why. Don't paste the raw dump unless they ask.
