-- Private photos.
--
-- The photos bucket was public, so anyone with a photo URL could fetch it
-- without signing in, whatever the storage policies said. It is now private:
-- the app serves photos through short-lived (1 hour) signed URLs created where
-- each page loads its data (lib/storage/photos.ts). Signing is allowed by the
-- existing photos_approved_read policy (approved members only).
--
-- people.photo_url now holds the path inside the bucket. Older rows hold the
-- full public URL; they are rewritten to the path here, and the app understands
-- both forms in case a row is written the old way in the meantime.
--
-- DEPLOY ORDER: ship the code first (it signs whatever it finds), then apply
-- this migration. Applying it before the code is live makes every photo 400
-- until the deploy finishes.

update storage.buckets set public = false where id = 'photos';

update public.people
set photo_url = substring(photo_url from '/storage/v1/object/public/photos/([^?#]+)')
where photo_url like '%/storage/v1/object/public/photos/%';
