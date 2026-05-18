# Supabase Auth Setup Checklist

Run through this in the Supabase dashboard whenever a new environment (dev / preview / prod) is created.

1. **URL Configuration**
   - Site URL set to the environment's base URL.
   - Add `<base>/auth/callback` to additional redirect URLs.
2. **Email provider**
   - Enabled, "Confirm email" ON, "Disable signup" ON.
   - To bootstrap the first admin: temporarily enable signup, sign up, then disable again.
3. **First admin promotion**
   - After first login, run in SQL editor:
     `update public.profiles set role = 'admin' where id = (select id from auth.users where email = '<you>');`
