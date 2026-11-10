-- Return the database clock used by assignment scheduling.
create or replace function public.get_server_time()
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  select clock_timestamp();
$$;

revoke all on function public.get_server_time() from public, anon, authenticated;
grant execute on function public.get_server_time() to service_role;
