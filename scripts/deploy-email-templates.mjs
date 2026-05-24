#!/usr/bin/env node
/**
 * Deploys all 6 branded email templates to Supabase via the Management API.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/deploy-email-templates.mjs
 *
 * Get your personal access token from:
 *   https://app.supabase.com/account/tokens
 *
 * The token needs "auth" scope (or full access) on the BigFatFamilyTree project.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");
const templatesDir = join(root, "supabase", "email-templates");

const PROJECT_REF = "srmmatuyiybtgowwvixd";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error("❌  Missing SUPABASE_ACCESS_TOKEN environment variable.");
  console.error("    Get your token at: https://app.supabase.com/account/tokens");
  console.error("    Then run: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/deploy-email-templates.mjs");
  process.exit(1);
}

function read(filename) {
  return readFileSync(join(templatesDir, filename), "utf-8");
}

const payload = {
  // Subject lines
  mailer_subjects_confirmation:     "Confirm your BigFatFamilyTree account",
  mailer_subjects_invite:           "You've been invited to BigFatFamilyTree",
  mailer_subjects_magic_link:       "Your BigFatFamilyTree sign-in link",
  mailer_subjects_email_change:     "Confirm your new email address — BigFatFamilyTree",
  mailer_subjects_recovery:         "Reset your BigFatFamilyTree password",
  mailer_subjects_reauthentication: "Your BigFatFamilyTree verification code",

  // HTML templates
  mailer_templates_confirmation_content:     read("confirm-signup.html"),
  mailer_templates_invite_content:           read("invite-user.html"),
  mailer_templates_magic_link_content:       read("magic-link.html"),
  mailer_templates_email_change_content:     read("change-email.html"),
  mailer_templates_recovery_content:         read("reset-password.html"),
  mailer_templates_reauthentication_content: read("reauthentication.html"),
};

console.log("🚀  Deploying email templates to BigFatFamilyTree...\n");

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }
);

if (!res.ok) {
  const body = await res.text();
  console.error(`❌  API error ${res.status}: ${body}`);
  process.exit(1);
}

console.log("✅  All 6 email templates deployed successfully!\n");
console.log("Templates applied:");
console.log("  • Confirm sign up");
console.log("  • Invite user");
console.log("  • Magic link / OTP");
console.log("  • Change email address");
console.log("  • Reset password");
console.log("  • Reauthentication");
console.log("\nView them at: https://app.supabase.com/project/srmmatuyiybtgowwvixd/auth/templates");
