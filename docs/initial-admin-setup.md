# Initial administrator setup

1. In Supabase Dashboard, open **Authentication → Users**.
2. Create the administrator account manually using the intended email address and a strong password.
3. Copy the new user's UUID.
4. In **SQL Editor**, run the following statement after replacing the UUID:

```sql
insert into public.admin_profiles (user_id, role)
values ('00000000-0000-0000-0000-000000000000', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

The profile table has Row Level Security enabled and no browser-facing policies. The application API must verify the Supabase Auth access token and check the corresponding `admin_profiles` row for every administrative request. Never expose the Supabase service-role key in Angular environment files, browser bundles, or source control.

To revoke administrative access, delete the profile row or disable the Auth user.
