#!/usr/bin/env node
/**
 * Copy family-tree DATA from one Supabase project into another.
 *
 * This copies the public application tables (people, relationships, events,
 * transcripts, extraction_proposals, settings). It does NOT copy auth users,
 * profiles, audit_log, or Storage objects — see the notes at the bottom.
 *
 * Prerequisites
 * -------------
 * 1. The DESTINATION project must already have the schema applied (run the
 *    migrations in supabase/migrations/ against it via the Supabase CLI or SQL
 *    editor first). This script copies rows, not tables.
 * 2. You need each project's URL and its SERVICE ROLE key (Dashboard →
 *    Project Settings → API → `service_role`). The service key bypasses RLS.
 *
 * Usage
 * -----
 *   SRC_URL=https://OLD.supabase.co   SRC_SERVICE_KEY=eyJ... \
 *   DEST_URL=https://NEW.supabase.co  DEST_SERVICE_KEY=eyJ... \
 *   DEST_UPLOADER_ID=<a profiles.id in the destination>  \
 *   node scripts/copy-supabase-data.mjs [--dry-run]
 *
 *   - DEST_UPLOADER_ID is only required if the source has transcripts
 *     (transcripts.uploaded_by is NOT NULL and references profiles). Set it to
 *     the profile id of an admin who has already signed into the new project.
 *   - --dry-run reads and reports counts without writing anything.
 *
 * The script is idempotent: it upserts on primary key, so re-running it is safe.
 */

import { createClient } from "@supabase/supabase-js";

const {
  SRC_URL,
  SRC_SERVICE_KEY,
  DEST_URL,
  DEST_SERVICE_KEY,
  DEST_UPLOADER_ID,
} = process.env;
const DRY_RUN = process.argv.includes("--dry-run");

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}
requireEnv("SRC_URL", SRC_URL);
requireEnv("SRC_SERVICE_KEY", SRC_SERVICE_KEY);
requireEnv("DEST_URL", DEST_URL);
requireEnv("DEST_SERVICE_KEY", DEST_SERVICE_KEY);

if (SRC_URL === DEST_URL) {
  console.error("SRC_URL and DEST_URL are the same project — refusing to run.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const src = createClient(SRC_URL, SRC_SERVICE_KEY, opts);
const dest = createClient(DEST_URL, DEST_SERVICE_KEY, opts);

const PAGE = 1000;

async function readAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await src
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function upsert(table, rows) {
  if (rows.length === 0) return 0;
  if (DRY_RUN) return rows.length;
  for (let i = 0; i < rows.length; i += PAGE) {
    const batch = rows.slice(i, i + PAGE);
    const { error } = await dest.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`write ${table}: ${error.message}`);
  }
  return rows.length;
}

async function copyPeople() {
  const people = await readAll("people");
  // Two-pass: people.father_id / mother_id are self-references. Insert every
  // row first with the parent links cleared, then fill them in, so a child is
  // never inserted before its parent exists.
  const firstPass = people.map((p) => ({ ...p, father_id: null, mother_id: null }));
  await upsert("people", firstPass);

  const withParents = people.filter((p) => p.father_id || p.mother_id);
  if (!DRY_RUN) {
    for (const p of withParents) {
      const { error } = await dest
        .from("people")
        .update({ father_id: p.father_id, mother_id: p.mother_id })
        .eq("id", p.id);
      if (error) throw new Error(`link parents for ${p.id}: ${error.message}`);
    }
  }
  return people.length;
}

async function copyTranscripts() {
  const rows = await readAll("transcripts");
  if (rows.length === 0) return 0;
  if (!DEST_UPLOADER_ID) {
    throw new Error(
      `Source has ${rows.length} transcript(s) but DEST_UPLOADER_ID is not set. ` +
        `transcripts.uploaded_by is NOT NULL → set DEST_UPLOADER_ID to a profiles.id in the destination.`,
    );
  }
  // uploaded_by must reference an existing destination profile; re-point it.
  const mapped = rows.map((r) => ({ ...r, uploaded_by: DEST_UPLOADER_ID }));
  return upsert("transcripts", mapped);
}

async function copyEvents() {
  const rows = await readAll("events");
  // contributed_by → profiles (nullable): drop it, the source profile id
  // won't exist in the destination.
  const mapped = rows.map((r) => ({ ...r, contributed_by: null }));
  return upsert("events", mapped);
}

async function copyProposals() {
  const rows = await readAll("extraction_proposals");
  const mapped = rows.map((r) => ({ ...r, reviewed_by: null }));
  return upsert("extraction_proposals", mapped);
}

async function main() {
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Copying data`);
  console.log(`  from ${SRC_URL}`);
  console.log(`  to   ${DEST_URL}\n`);

  // Order respects NOT NULL foreign keys:
  // people → transcripts → events → relationships → proposals → settings
  const steps = [
    ["people", copyPeople],
    ["transcripts", copyTranscripts],
    ["events", copyEvents],
    ["relationships", () => readAll("relationships").then((r) => upsert("relationships", r))],
    ["extraction_proposals", copyProposals],
    ["settings", () => readAll("settings").then((r) => upsert("settings", r))],
  ];

  for (const [name, fn] of steps) {
    try {
      const n = await fn();
      console.log(`  ${name.padEnd(22)} ${n} row(s)`);
    } catch (e) {
      console.error(`\n✗ Failed on ${name}: ${e.message}`);
      process.exit(1);
    }
  }

  console.log(`\n${DRY_RUN ? "Dry run complete — nothing written." : "Done."}`);
  console.log(
    "\nNotes:\n" +
      "  • Photos/audio (photo_url, audio_url) still point at the SOURCE project's\n" +
      "    Storage. Keep the old project alive, or re-upload media to the new one.\n" +
      "  • auth users, profiles, and audit_log are NOT copied. Invite family\n" +
      "    members in the new project; their new profile ids differ from the old.\n" +
      "  • Event/proposal author links were cleared; transcript uploads were\n" +
      "    re-attributed to DEST_UPLOADER_ID.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
