// Shared, client-safe types for the member-accounts feature. No server imports.

export type MemberRole = "admin" | "editor" | "viewer";

export type LinkRequestStatus = "pending" | "approved" | "declined" | "cancelled";

/** The signed-in user's own place in the tree (null when not linked yet). */
export type CurrentPerson = {
  id: string;
  slug: string | null;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  photo_url: string | null;
};

export type Gender = "m" | "f" | "unknown";

/** A person as shown in search results / pickers, with their parents spelled out. */
export type PersonSummary = {
  id: string;
  slug: string | null;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  gender: Gender;
  /** Raw people.birth_date text (may be "1998", "1998-04-12", ...). */
  birth_date: string | null;
  birthYear: number | null;
  fatherName: { en: string; ar: string } | null;
  motherName: { en: string; ar: string } | null;
};

export type DobMatch = "exact" | "year" | "none";

export type ClaimCandidate = PersonSummary & {
  dobMatch: DobMatch;
  /** Already linked to someone's account. */
  claimed: boolean;
};

/** An account as the admin sees it. */
export type MemberAccount = {
  id: string;
  fullName: string;
  email: string | null;
  /** false = signed up but never confirmed the address; null = unknown (status unavailable). */
  emailConfirmed: boolean | null;
  dateOfBirth: string | null;
  createdAt: string;
  role: MemberRole;
  personId: string | null;
  /** An admin has let this account in (or it is an admin). */
  approved: boolean;
  /** The owner account (always an admin). */
  isSuperAdmin: boolean;
  /** How they sign in: "pin" = name + birthday + PIN (no email). */
  loginMethod: "email" | "pin";
  /** An admin reset their PIN and they have not chosen a new one yet. */
  pinMustChange: boolean;
};

export type MemberRow = MemberAccount & { person: PersonSummary | null };

export type PendingRequest = {
  id: string;
  createdAt: string;
  parentsNote: string | null;
  account: MemberAccount;
  /** The person they say they are; null = "not in the tree yet". */
  person: PersonSummary | null;
  /** That person already belongs to a different account. */
  personClaimedByOther: boolean;
};

/** A relative a member says is not on the site yet. */
export type SuggestionRow = {
  id: string;
  createdAt: string;
  name: string;
  relation: string;
  note: string | null;
  suggestedBy: MemberAccount;
};

/** What a member sees about their own suggestions. */
export type MySuggestion = {
  id: string;
  name: string;
  relation: string;
  status: "pending" | "added" | "already_in_tree" | "dismissed";
  createdAt: string;
};

export type MembersAdminData = {
  pending: PendingRequest[];
  /** Accounts with no request and no approval: waiting for a decision. */
  waitingAccess: MemberAccount[];
  suggestions: SuggestionRow[];
  members: MemberRow[];
  people: PersonSummary[];
  /** Set when the member tables could not be read (e.g. migrations not applied yet). */
  loadError?: string;
};

export type MemberActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };
