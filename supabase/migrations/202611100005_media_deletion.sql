-- Prepare a media asset for deletion while preventing concurrent assignments.
-- The API removes the private Storage object and then deletes the metadata row.
create or replace function public.prepare_media_asset_deletion(
  p_venue_id uuid,
  p_media_asset_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storage_path text;
begin
  select a.storage_path
    into v_storage_path
    from public.media_assets a
   where a.id = p_media_asset_id
     and a.venue_id = p_venue_id
   for update;

  if not found then
    raise exception 'MEDIA_ASSET_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (
    select 1
      from public.device_assignments da
     where da.media_asset_id = p_media_asset_id
  ) then
    raise exception 'MEDIA_ASSET_IN_USE' using errcode = '23503';
  end if;

  -- Failed assets are not eligible for assignment. Repeated calls are safe,
  -- allowing cleanup to be retried after a transient Storage/API failure.
  update public.media_assets
     set status = 'failed'
   where id = p_media_asset_id
     and venue_id = p_venue_id;

  return v_storage_path;
end;
$$;

revoke all on function public.prepare_media_asset_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_media_asset_deletion(uuid, uuid) to service_role;
