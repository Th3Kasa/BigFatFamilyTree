# Profile timeline and Google Drive photo storage

Every profile page has a timeline where approved family members share photos
(up to 5 per post, 15 MB each), stories and YouTube / Facebook / Instagram
video links, tag relatives, heart and comment. Posts appear straight away.

**Only an admin sets this up, once.** Family members never sign in to Google
and have nothing extra to do.

## Who can do what

| Action | Who |
|---|---|
| See the timeline | Approved family members |
| Post on any profile | Approved family members (no approval step) |
| Edit a post's words, date, place | Its author |
| Delete a post | Its author, the member linked to that profile, or an admin |
| Delete a comment | Its author, the post's author, the profile's owner, or an admin |
| Remove a tag | The post's author, the tagged person's owner, or an admin |

These rules are enforced by the database (migration `20260602000032_profile_timeline.sql`),
not only by the buttons. Deleted posts are hidden (soft delete); their photos stay in the Drive.

## How photos are stored

- Photos are saved in a **"Big Fat Family Tree"** folder in the connected Google Drive.
  Each photo is stored twice: the full-quality original, and a smaller timeline copy
  (about 1600 px, made on the phone before upload) so timelines load fast.
- The site asks Google for the narrowest permission (`drive.file`): it can only see the
  files it created. The rest of the Drive is invisible to it.
- Files are **never shared publicly**. Members get them through `/api/media/…`, which checks
  they're an approved member first. Each browser keeps its own private copy for a week.
- The Google sign-in is stored encrypted (AES-256-GCM) with `DRIVE_TOKEN_KEY`, which only
  lives in Vercel.
- Uploads go phone → site → Drive in 4 MB pieces. The site checks each file really is a
  JPEG, PNG, WebP or GIF, and enforces 5 photos per post and 15 MB per photo.

## One-time setup (admin)

### 1. Apply the database change

Supabase → SQL editor → paste and run `supabase/migrations/20260602000032_profile_timeline.sql`, then `20260603000033_timeline_author_lockdown.sql`.
(The site works before this: the timeline shows life events only, with no composer.)

### 2. Create the Google sign-in for the site (about 10 minutes)

1. Open <https://console.cloud.google.com> signed in as the Google account that should own the
   setup (for example the 5 TB account).
2. Create a project, e.g. **Big Fat Family Tree**.
3. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
4. **Google Auth Platform** (OAuth consent screen) → **Get started**:
   - App name: *Big Fat Family Tree*; support email: yours.
   - Audience: **External**.
   - Contact email: yours. Finish.
5. **Audience → Publish app** (status *In production*). Important: in *Testing* mode Google
   ends the connection after 7 days. The app only uses the `drive.file` permission plus your
   email, which Google treats as non-sensitive, so no review is needed.
6. **Clients → Create client** → type **Web application**:
   - Authorised redirect URI: `https://www.bigfatfamilytree.com.au/api/drive/callback` (the live site; also add `https://bigfatfamilytree.vercel.app/api/drive/callback`, and connect from the www address)
     (add any other domain the site uses, with the same `/api/drive/callback` ending).
   - Create, then copy the **Client ID** and **Client secret**.

### 3. Add three settings in Vercel

Vercel → project → **Settings → Environment Variables** (Production):

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the Client ID |
| `GOOGLE_CLIENT_SECRET` | the Client secret |
| `DRIVE_TOKEN_KEY` | 32 random bytes, base64. Make one with `openssl rand -base64 32`, or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

Then **redeploy** so the site picks them up. Keep `DRIVE_TOKEN_KEY` safe: if it changes, an
admin just presses **Reconnect**.

### 4. Connect the Drive

1. On the site (https://www.bigfatfamilytree.com.au), open **Admin**. The **Photo storage: Google Drive** card is at the top.
2. Press **Connect Google Drive**, sign in with the Google account whose Drive should hold the
   photos (e.g. the 5 TB one), and allow access.
3. The card shows **Connected as …**. Photo posting is now on for everyone.

## If something goes wrong

- **Card says "Reconnect"**: the Google access was removed or the password changed in a way that
  ended it. Press **Reconnect Google Drive** and sign in with the **same** account; the existing
  folder is reused and every photo comes back.
- **Switching to a different Google account** starts a new folder; photos in the old account's
  folder won't show (they're still in that Drive).
- **Disconnect** turns photo uploads off and hides photos until you reconnect. Nothing is deleted.
- Drive is the only copy of the originals. Consider downloading the folder occasionally
  (Google Takeout or the Drive app) to an external disk.
