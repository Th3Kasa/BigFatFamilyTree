// Turns raw audit_log rows (a full copy of the record before and after each
// change) into plain sentences for admins: who did what, to whom, and what
// changed. Pure: names are looked up by the caller and passed in.

export type AuditInput = {
  operation: string;
  table_name: string;
  row_id: string | null;
  actor_id: string | null;
  before: unknown;
  after: unknown;
};

export type AuditNames = {
  /** profiles.id -> member's name */
  member: (id: string | null | undefined) => string | null;
  /** people.id -> person's name */
  person: (id: string | null | undefined) => string | null;
};

export type AuditChange = { field: string; from: string; to: string };

export type AuditView = {
  /** "Basem Morkos", or "The system" for automatic changes. */
  who: string;
  /** "changed Nassif Mansour's birth date" */
  what: string;
  /** Field by field, for the details panel. Empty when there's nothing useful to list. */
  changes: AuditChange[];
  /** For colouring: added, changed or removed. */
  kind: "added" | "changed" | "removed";
};

type Row = Record<string, unknown>;
const asRow = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Changes nobody needs to read (bookkeeping, internal ids, positions). */
const NOISE = new Set(["updated_at", "created_at", "id", "slug", "pos_x", "pos_y", "name_key", "token_hash"]);

const FIELD_LABELS: Record<string, string> = {
  given_en: "First name",
  given_ar: "First name (Arabic)",
  family_name_en: "Family name",
  family_name_ar: "Family name (Arabic)",
  father_name_en: "Father's name",
  father_name_ar: "Father's name (Arabic)",
  grandfather_name_en: "Grandfather's name",
  grandfather_name_ar: "Grandfather's name (Arabic)",
  great_grandfather_name_en: "Great-grandfather's name",
  great_grandfather_name_ar: "Great-grandfather's name (Arabic)",
  gender: "Gender",
  birth_date: "Birth date",
  death_date: "Death date",
  birth_order: "Birth order",
  notes_en: "Notes",
  notes_ar: "Notes (Arabic)",
  photo_url: "Photo",
  father_id: "Father",
  mother_id: "Mother",
  is_placeholder: "Placeholder card",
  deleted_at: "Removed",
  created_by: "Added by",
  role: "Role",
  approved_at: "Approved",
  approved_by: "Approved by",
  person_id: "Linked person",
  display_name: "Display name",
  full_name: "Full name",
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  date_of_birth: "Date of birth",
  login_method: "Sign-in method",
  status: "Status",
  type: "Type",
  title: "Title",
  body: "Text",
  location: "Place",
  date_value: "Date",
  date_precision: "Date accuracy",
  story_en: "Story",
  story_ar: "Story (Arabic)",
  custom_label: "Label",
  order_index: "Marriage order",
};

const label = (field: string) => FIELD_LABELS[field] ?? field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const GENDER: Record<string, string> = { m: "male", f: "female", unknown: "not set" };
const STATUS: Record<string, string> = { current: "married", divorced: "divorced", widowed: "widowed", pending: "waiting", approved: "approved", rejected: "declined" };

/** Secrets and hashes are never shown, even to admins. */
export const isSensitiveField = (field: string) => /pin|token|password|hash|secret/i.test(field);

/** A copy of a stored record with secrets blanked, for the "technical details" view. */
export function redact(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  return Object.fromEntries(Object.entries(v as Row).map(([k, x]) => [k, isSensitiveField(k) && x != null ? "(hidden)" : x]));
}

function show(field: string, v: unknown, names: AuditNames): string {
  if (isSensitiveField(field)) return "(hidden)";
  if (v === null || v === undefined || v === "") return "(empty)";
  if (field === "father_id" || field === "mother_id" || field === "person_id") return names.person(str(v)) ?? "someone";
  if (field === "approved_by" || field === "created_by" || field === "reviewed_by") return names.member(str(v)) ?? "someone";
  if (field === "gender") return GENDER[String(v)] ?? String(v);
  if (field === "status") return STATUS[String(v)] ?? String(v);
  if (field === "photo_url") return "a photo";
  if (field === "deleted_at" || field === "approved_at") return "yes";
  if (typeof v === "boolean") return v ? "yes" : "no";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

/** Fields that really changed, minus bookkeeping. */
export function changedFields(before: Row, after: Row): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => !NOISE.has(k) && JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
}

function personFromRow(r: Row): string | null {
  const given = str(r.given_en) ?? str(r.given_ar);
  const family = str(r.family_name_en) ?? str(r.family_name_ar);
  const n = [given, family].filter(Boolean).join(" ").trim();
  return n || null;
}

function memberFromRow(r: Row): string | null {
  const n = [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ").trim();
  return n || str(r.display_name) || str(r.full_name) || null;
}

const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

const KNOWN_EVENTS: Record<string, string> = {
  pin_locked_24h: "was locked out for the day after too many wrong PINs",
  pin_birthday_added: "added their birthday while signing in",
  pin_devices_revoked: "had their remembered devices signed out",
  pin_reset: "had their PIN reset",
  pin_changed: "changed their PIN",
};

export function describeAudit(row: AuditInput, names: AuditNames): AuditView {
  const before = asRow(row.before);
  const after = asRow(row.after);
  const op = row.operation.toLowerCase();
  const who = names.member(row.actor_id) ?? (row.actor_id ? "A member" : "The system");
  const kind: AuditView["kind"] = op === "insert" ? "added" : op === "delete" ? "removed" : "changed";
  const fields = op === "update" ? changedFields(before, after) : [];
  const changes = fields.map((f) => ({ field: label(f), from: show(f, before[f], names), to: show(f, after[f], names) }));
  const both = { ...before, ...after };

  // Events written by the app (no table row behind them).
  const event = str(after.event);
  if (event) {
    const subject = names.member(row.row_id) ?? "A member";
    return { who: subject, what: KNOWN_EVENTS[event] ?? event.replace(/_/g, " "), changes: [], kind: "changed" };
  }

  switch (row.table_name) {
    case "people": {
      const name = personFromRow(both) ?? names.person(row.row_id) ?? "someone";
      if (op === "insert") return { who, what: `added ${name} to the tree`, changes: [], kind };
      if (op === "delete") return { who, what: `permanently deleted ${name}`, changes: [], kind };
      if (fields.includes("deleted_at")) {
        return after.deleted_at
          ? { who, what: `removed ${name} from the tree`, changes: [], kind: "removed" }
          : { who, what: `brought ${name} back to the tree`, changes: [], kind: "added" };
      }
      if (fields.length === 0) {
        const moved = JSON.stringify(before.pos_x) !== JSON.stringify(after.pos_x) || JSON.stringify(before.pos_y) !== JSON.stringify(after.pos_y);
        return { who, what: moved ? `moved ${possessive(name)} card on the tree` : `saved ${possessive(name)} details (nothing changed)`, changes: [], kind };
      }
      if (fields.length === 1) {
        const f = fields[0];
        if (f === "photo_url") return { who, what: after.photo_url ? `changed ${possessive(name)} photo` : `removed ${possessive(name)} photo`, changes: [], kind };
        if (f === "birth_order") return { who, what: `changed the birth order of ${name}`, changes, kind };
        if (f === "father_id" || f === "mother_id") {
          const role = f === "father_id" ? "father" : "mother";
          return after[f]
            ? { who, what: `set ${possessive(name)} ${role} to ${show(f, after[f], names)}`, changes, kind }
            : { who, what: `removed ${possessive(name)} ${role}`, changes, kind };
        }
        return { who, what: `changed ${possessive(name)} ${label(f).toLowerCase()}`, changes, kind };
      }
      return { who, what: `edited ${possessive(name)} details`, changes, kind };
    }

    case "relationships": {
      const a = names.person(str(both.person_a_id)) ?? "someone";
      const b = names.person(str(both.person_b_id)) ?? "someone";
      const type = str(both.type);
      const link =
        type === "spouse" ? `the marriage of ${a} and ${b}`
        : type === "adopted_by" ? `${a}'s adoption by ${b}`
        : type === "raised_by" ? `${b} as ${possessive(a)} guardian`
        : type === "godparent" ? `${b} as ${possessive(a)} godparent`
        : `a link between ${a} and ${b}`;
      if (op === "insert") return { who, what: `recorded ${link}`, changes: [], kind };
      if (op === "delete") return { who, what: `removed ${link}`, changes: [], kind };
      if (fields.length === 1 && fields[0] === "status") return { who, what: `marked ${a} and ${b} as ${STATUS[String(after.status)] ?? String(after.status)}`, changes, kind };
      return { who, what: `updated ${link}`, changes, kind };
    }

    case "profiles": {
      const member = memberFromRow(both) ?? names.member(row.row_id) ?? "a member";
      const self = row.actor_id && row.actor_id === row.row_id;
      if (op === "insert") return { who: self || !row.actor_id ? member : who, what: self || !row.actor_id ? "joined the site" : `created an account for ${member}`, changes: [], kind };
      if (op === "delete") return { who, what: `deleted ${possessive(member)} account`, changes: [], kind };
      if (fields.includes("approved_at") && after.approved_at && !before.approved_at) return { who, what: `approved ${member} as a family member`, changes, kind };
      if (fields.includes("role")) return { who, what: `changed ${possessive(member)} role from ${show("role", before.role, names)} to ${show("role", after.role, names)}`, changes, kind };
      if (fields.includes("person_id")) {
        return after.person_id
          ? { who, what: `linked ${possessive(member)} account to ${show("person_id", after.person_id, names)} on the tree`, changes, kind }
          : { who, what: `unlinked ${possessive(member)} account from the tree`, changes, kind };
      }
      if (fields.length === 0) return { who, what: self ? "signed in or used the site" : `opened ${possessive(member)} account (nothing changed)`, changes: [], kind };
      return { who, what: self ? "updated their own account" : `updated ${possessive(member)} account`, changes, kind };
    }

    case "link_requests": {
      const member = names.member(str(both.profile_id)) ?? "a member";
      const person = names.person(str(both.person_id)) ?? "someone";
      if (op === "insert") return { who: names.member(str(both.profile_id)) ?? who, what: `asked to be linked to ${person} on the tree`, changes: [], kind };
      if (op === "delete") return { who, what: `withdrew ${possessive(member)} request to be ${person}`, changes: [], kind };
      if (fields.includes("status")) {
        const s = String(after.status);
        return { who, what: `${s === "approved" ? "approved" : s === "rejected" ? "declined" : "updated"} ${possessive(member)} request to be ${person}`, changes, kind };
      }
      return { who, what: `updated ${possessive(member)} request to be ${person}`, changes, kind };
    }

    case "posts": {
      const person = names.person(str(both.person_id)) ?? "someone";
      if (op === "insert") return { who, what: `shared a post on ${possessive(person)} profile`, changes: [], kind };
      if (fields.includes("deleted_at") && after.deleted_at) return { who, what: `deleted a post on ${possessive(person)} profile`, changes: [], kind: "removed" };
      return { who, what: `edited a post on ${possessive(person)} profile`, changes, kind };
    }

    case "events": {
      const person = names.person(str(both.person_id)) ?? "someone";
      if (op === "insert") return { who, what: `added a life event to ${possessive(person)} story`, changes: [], kind };
      if (op === "delete") return { who, what: `removed a life event from ${possessive(person)} story`, changes: [], kind };
      return { who, what: `edited a life event in ${possessive(person)} story`, changes, kind };
    }

    case "relative_suggestions":
      return { who, what: op === "insert" ? "suggested a relative" : op === "delete" ? "removed a relative suggestion" : "answered a relative suggestion", changes, kind };

    case "family_settings":
      return { who, what: "changed the family settings", changes: changes.filter((c) => !/pin/i.test(c.field)), kind };

    default:
      return { who, what: `${kind} a ${row.table_name.replace(/_/g, " ")} record`, changes, kind };
  }
}

/** Every profile id and person id an audit row mentions, so the caller can look up names in one go. */
export function referencedIds(rows: AuditInput[]): { members: string[]; people: string[] } {
  const members = new Set<string>();
  const people = new Set<string>();
  for (const r of rows) {
    const b = { ...asRow(r.before), ...asRow(r.after) };
    if (r.actor_id) members.add(r.actor_id);
    for (const k of ["approved_by", "created_by", "reviewed_by", "profile_id"]) if (str(b[k])) members.add(b[k] as string);
    for (const k of ["father_id", "mother_id", "person_id", "person_a_id", "person_b_id"]) if (str(b[k])) people.add(b[k] as string);
    if (r.row_id && r.table_name === "people") people.add(r.row_id);
    if (r.row_id && (r.table_name === "profiles" || str(asRow(r.after).event))) members.add(r.row_id);
  }
  return { members: [...members], people: [...people] };
}
