#!/usr/bin/env node
// Text-only Playwright runner: one process, one headless browser, plain-text
// report on stdout. No screenshots unless --screenshot is passed.
//
//   node scripts/pw.mjs <url> [options]            read one page
//   node scripts/pw.mjs --steps <file|json> [opts]  run a multi-step task
//   node scripts/pw.mjs --script <file.mjs> [opts]  run custom Playwright code
//   node scripts/pw.mjs --crawl <url> [opts]        visit every same-origin page
//
// Options:
//   --select <css>       extract text from this selector instead of <body>
//   --max <n>            max characters of page text per page (default 3000)
//   --no-text            report status/errors only, no page text
//   --wait <css|ms>      wait for a selector or N ms after load
//   --mobile             375x812 viewport with a mobile user agent
//   --storage <file>     load Playwright storageState (cookies) for auth'd pages
//   --save-storage <f>   write storageState after the run (e.g. after logging in)
//   --limit <n>          crawl: max pages (default 50)
//   --timeout <ms>       per-action timeout (default 15000)
//   --screenshot <file>  full-page PNG of the final page (visual debugging only)
//   --headed             show the browser window
//
// Exit code: 0 = clean, 1 = navigation failure, failed expectation, HTTP >= 400,
// uncaught page error or console error; 2 = bad usage.

import { chromium, devices } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = "Usage: node scripts/pw.mjs <url> | --steps <file|json> | --script <file.mjs> | --crawl <url>  [options]";

function parseArgs(argv) {
  const opts = { max: 3000, limit: 50, timeout: 15000, text: true };
  const flags = new Set(["--mobile", "--headed", "--no-text"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { opts.url = a; continue; }
    if (flags.has(a)) {
      if (a === "--no-text") opts.text = false;
      else opts[a.slice(2)] = true;
      continue;
    }
    const v = argv[++i];
    if (v === undefined) fail(`Missing value for ${a}`);
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    opts[key] = ["max", "limit", "timeout"].includes(key) ? Number(v) : v;
  }
  return opts;
}

function fail(msg) {
  console.error(`${msg}\n${USAGE}`);
  process.exit(2);
}

// Walks the DOM in the page and returns compact Markdown-ish text: headings,
// list items, links, buttons and form fields keep their meaning; scripts,
// styles and hidden elements are dropped.
function extractText(selector) {
  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) return `(selector not found: ${selector})`;
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "TEMPLATE", "CANVAS"]);
  const BLOCK = /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|NAV|ASIDE|FORM|TABLE|TR|UL|OL|LI|H[1-6]|BR|HR|FIELDSET|DIALOG)$/;
  const out = [];
  const visible = (el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.getAttribute("aria-hidden") !== "true";
  };
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) { out.push(node.textContent); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || SKIP.has(node.tagName) || !visible(node)) return;
    const tag = node.tagName;
    const label = (el) => (el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").trim().replace(/\s+/g, " ");
    if (/^H[1-6]$/.test(tag)) { out.push(`\n${"#".repeat(+tag[1])} ${label(node)}\n`); return; }
    if (tag === "A" && node.href) { out.push(` [${label(node) || "link"}](${node.getAttribute("href")}) `); return; }
    if (tag === "BUTTON") { out.push(` [button: ${label(node)}] `); return; }
    if (tag === "IMG") { if (node.alt) out.push(` [img: ${node.alt}] `); return; }
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      const type = node.type || tag.toLowerCase();
      if (type === "hidden") return;
      const name = node.getAttribute("aria-label") || node.placeholder || node.name || node.id;
      const val = type === "password" ? "***" : node.value;
      out.push(` [${type}${name ? ` "${name}"` : ""}${val ? ` = ${val}` : ""}] `);
      return;
    }
    if (tag === "LI") out.push("\n- ");
    else if (BLOCK.test(tag)) out.push("\n");
    for (const child of node.childNodes) walk(child);
    if (BLOCK.test(tag)) out.push("\n");
  };
  walk(root);
  return out.join("")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function attachCollectors(page, report) {
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") report.console.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => report.pageErrors.push(e.message));
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "failed";
    if (why !== "net::ERR_ABORTED") report.network.push(`${why} ${r.method()} ${r.url()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) report.network.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}

function newReport() {
  return { console: [], pageErrors: [], network: [], log: [], failed: false };
}

async function waitOpt(page, wait) {
  if (!wait) return;
  if (/^\d+$/.test(wait)) await page.waitForTimeout(Number(wait));
  else await page.waitForSelector(wait);
}

async function pageSummary(page, opts, report, response, selector) {
  const lines = [];
  const status = response ? response.status() : "n/a";
  if (typeof status === "number" && status >= 400) report.failed = true;
  lines.push(`URL: ${page.url()}`);
  lines.push(`Status: ${status}`);
  lines.push(`Title: ${await page.title()}`);
  if (opts.text) {
    let text = await page.evaluate(extractText, selector ?? opts.select ?? null);
    if (text.length > opts.max) text = `${text.slice(0, opts.max)}\n… [truncated, ${text.length - opts.max} more chars; raise --max or use --select]`;
    lines.push(`--- text${selector || opts.select ? ` (${selector ?? opts.select})` : ""} ---`, text || "(empty)");
  }
  return lines.join("\n");
}

function errorBlock(report) {
  const dedupe = (a) => [...new Set(a)];
  const parts = [];
  const sections = [
    ["Page errors", report.pageErrors],
    ["Console errors/warnings", report.console],
    ["Network failures", report.network],
  ];
  for (const [title, items] of sections) {
    const list = dedupe(items);
    parts.push(list.length ? `${title} (${list.length}):\n${list.slice(0, 20).map((x) => `  - ${x.slice(0, 300)}`).join("\n")}` : `${title}: none`);
  }
  if (report.pageErrors.length || report.console.some((c) => c.startsWith("error"))) report.failed = true;
  return parts.join("\n");
}

// ---- modes -----------------------------------------------------------------

async function runRead(page, opts, report) {
  const res = await page.goto(opts.url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await waitOpt(page, opts.wait);
  return pageSummary(page, opts, report, res);
}

// Step shapes (one action key per object):
//   {goto:url} {click:css} {fill:css,value} {press:key,on?:css} {select:css,value}
//   {check:css} {hover:css} {wait:css|ms} {waitForUrl:pattern}
//   {text:css?} {expectText:string,in?:css} {expectUrl:substring}
//   {eval:"js expression"} {screenshot:file}
async function runSteps(page, opts, report) {
  const raw = existsSync(opts.steps) ? readFileSync(opts.steps, "utf8") : opts.steps;
  let steps;
  try { steps = JSON.parse(raw); } catch (e) { fail(`--steps is not valid JSON: ${e.message}`); }
  if (!Array.isArray(steps)) fail("--steps must be a JSON array");
  if (opts.url) steps.unshift({ goto: opts.url });

  const out = [];
  let lastResponse = null;
  for (const [i, s] of steps.entries()) {
    const n = `${i + 1}.`;
    try {
      if (s.goto) {
        lastResponse = await page.goto(new URL(s.goto, page.url() === "about:blank" ? undefined : page.url()).href, { waitUntil: "load" });
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        out.push(`${n} goto ${page.url()} -> ${lastResponse?.status() ?? "n/a"}`);
      } else if (s.click) { await page.click(s.click); out.push(`${n} click ${s.click}`); }
      else if (s.fill) { await page.fill(s.fill, String(s.value ?? "")); out.push(`${n} fill ${s.fill}`); }
      else if (s.press) { await (s.on ? page.press(s.on, s.press) : page.keyboard.press(s.press)); out.push(`${n} press ${s.press}`); }
      else if (s.select) { await page.selectOption(s.select, s.value); out.push(`${n} select ${s.select} = ${s.value}`); }
      else if (s.check) { await page.check(s.check); out.push(`${n} check ${s.check}`); }
      else if (s.hover) { await page.hover(s.hover); out.push(`${n} hover ${s.hover}`); }
      else if (s.wait !== undefined) { await waitOpt(page, String(s.wait)); out.push(`${n} wait ${s.wait}`); }
      else if (s.waitForUrl) { await page.waitForURL(`**${s.waitForUrl}**`); out.push(`${n} url matched ${page.url()}`); }
      else if ("text" in s) {
        let t = await page.evaluate(extractText, s.text || null);
        if (t.length > opts.max) t = `${t.slice(0, opts.max)}\n… [truncated]`;
        out.push(`${n} text${s.text ? ` (${s.text})` : ""}:\n${t}`);
      } else if (s.expectText) {
        const t = await page.evaluate(extractText, s.in || null);
        const ok = t.includes(s.expectText);
        if (!ok) report.failed = true;
        out.push(`${n} expect text "${s.expectText}"${s.in ? ` in ${s.in}` : ""}: ${ok ? "PASS" : "FAIL"}`);
      } else if (s.expectUrl) {
        const ok = page.url().includes(s.expectUrl);
        if (!ok) report.failed = true;
        out.push(`${n} expect url contains "${s.expectUrl}": ${ok ? "PASS" : `FAIL (at ${page.url()})`}`);
      } else if (s.eval) {
        const v = await page.evaluate(s.eval);
        out.push(`${n} eval -> ${typeof v === "string" ? v : JSON.stringify(v)}`);
      } else if (s.screenshot) { await page.screenshot({ path: s.screenshot, fullPage: true }); out.push(`${n} screenshot ${s.screenshot}`); }
      else out.push(`${n} unknown step ${JSON.stringify(s)}`);
    } catch (e) {
      report.failed = true;
      out.push(`${n} FAILED ${JSON.stringify(s)}: ${e.message.split("\n")[0]}`);
      break;
    }
  }
  out.push("", await pageSummary(page, { ...opts, text: opts.text && !steps.some((s) => "text" in s) }, report, lastResponse));
  return out.join("\n");
}

// The module's default export receives { page, context, browser, log } and
// may return a string/object, which is printed.
async function runScript(page, opts, report, context, browser) {
  const mod = await import(pathToFileURL(resolve(opts.script)).href);
  if (typeof mod.default !== "function") fail("--script must `export default async ({ page, log }) => {...}`");
  const log = (...a) => report.log.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  const result = await mod.default({ page, context, browser, log, extractText: (sel) => page.evaluate(extractText, sel ?? null) });
  const out = [];
  if (report.log.length) out.push(report.log.join("\n"));
  if (result !== undefined) out.push(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  if (opts.url || page.url() !== "about:blank") out.push("", await pageSummary(page, { ...opts, text: false }, report, null));
  return out.join("\n");
}

async function runCrawl(page, opts, report) {
  const start = new URL(opts.crawl);
  const seen = new Set();
  const queue = [start.href];
  const rows = [];
  let bad = 0;
  while (queue.length && seen.size < opts.limit) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const per = newReport();
    const handlers = {
      console: (m) => m.type() === "error" && per.console.push(m.text()),
      pageerror: (e) => per.pageErrors.push(e.message),
      response: (r) => r.status() >= 500 && per.network.push(`HTTP ${r.status()} ${r.url()}`),
    };
    for (const [ev, fn] of Object.entries(handlers)) page.on(ev, fn);
    let status = "ERR";
    let note = "";
    try {
      const res = await page.goto(url, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      status = res?.status() ?? "n/a";
      const final = page.url();
      if (final !== url) {
        const f = new URL(final);
        note = `-> ${f.origin === start.origin ? f.pathname : `${f.origin}${f.pathname}`}`;
      }
      const links = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
      for (const l of links) {
        const u = new URL(l);
        u.hash = "";
        if (u.origin === start.origin && !u.pathname.startsWith("/_") && !seen.has(u.href) && !/\.(png|jpe?g|svg|pdf|zip|ico|webp)$/i.test(u.pathname)) queue.push(u.href);
      }
    } catch (e) {
      note = e.message.split("\n")[0];
    }
    for (const [ev, fn] of Object.entries(handlers)) page.off(ev, fn);
    const errs = [...per.pageErrors.map((x) => `pageerror: ${x}`), ...per.console.map((x) => `console: ${x}`), ...per.network];
    const ok = typeof status === "number" && status < 400 && errs.length === 0;
    if (!ok) bad++;
    rows.push(`${ok ? "OK  " : "FAIL"} ${status} ${new URL(url).pathname}${note ? ` ${note}` : ""}${errs.length ? `\n       ${[...new Set(errs)].slice(0, 5).map((e) => e.slice(0, 200)).join("\n       ")}` : ""}`);
  }
  if (bad) report.failed = true;
  return [`Crawled ${seen.size} page(s) from ${start.origin} — ${bad} with problems${queue.length ? ` (stopped at --limit ${opts.limit})` : ""}`, ...rows].join("\n");
}

// ---- main ------------------------------------------------------------------

const opts = parseArgs(process.argv.slice(2));
if (!opts.url && !opts.steps && !opts.script && !opts.crawl) fail("Nothing to do.");

const browser = await chromium.launch({ headless: !opts.headed });
const context = await browser.newContext({
  ...(opts.mobile ? devices["iPhone 13"] : { viewport: { width: 1280, height: 800 } }),
  ...(opts.storage ? { storageState: opts.storage } : {}),
});
context.setDefaultTimeout(opts.timeout);
const page = await context.newPage();
const report = newReport();

let body;
const started = Date.now();
try {
  if (opts.crawl) body = await runCrawl(page, opts, report);
  else {
    attachCollectors(page, report);
    if (opts.script) {
      if (opts.url) await page.goto(opts.url, { waitUntil: "load" });
      body = await runScript(page, opts, report, context, browser);
    } else if (opts.steps) body = await runSteps(page, opts, report);
    else body = await runRead(page, opts, report);
    body += `\n\n${errorBlock(report)}`;
  }
  if (opts.screenshot) {
    await page.screenshot({ path: opts.screenshot, fullPage: true });
    body += `\nScreenshot: ${resolve(opts.screenshot)}`;
  }
  if (opts.saveStorage) {
    await context.storageState({ path: opts.saveStorage });
    body += `\nSaved storage state: ${opts.saveStorage}`;
  }
} catch (e) {
  report.failed = true;
  body = `${body ?? ""}\nRUN FAILED: ${e.message.split("\n").slice(0, 3).join(" | ")}\nAt: ${page.url()}\n\n${errorBlock(report)}`;
} finally {
  await browser.close();
}

console.log(`${body.trim()}\n\nResult: ${report.failed ? "FAIL" : "PASS"} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
process.exitCode = report.failed ? 1 : 0;
