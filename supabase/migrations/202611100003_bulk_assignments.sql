-- Assign one media asset to multiple displays with one shared server timestamp.
-- This is the synchronization boundary for a group of TVs.
create or replace function public.assign_media_to_devices(
  p_venue_id uuid,
  p_device_ids uuid[],
  p_media_asset_id uuid,
  p_image_duration_ms integer default 10000
)
returns setof public.device_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
  v_device_count integer;
  v_started_at timestamptz;
begin
  if p_device_ids is null
     or cardinality(p_device_ids) < 1
     or cardinality(p_device_ids) > 100
     or cardinality(p_device_ids) <> (
       select count(distinct device_id) from unnest(p_device_ids) as device_id
     ) then
    raise exception 'INVALID_DEVICE_LIST' using errcode = '22023';
  end if;

  if p_image_duration_ms < 1000 or p_image_duration_ms > 3600000 then
    raise exception 'IMAGE_DURATION_OUT_OF_RANGE' using errcode = '22023';
  end if;

  perform d.id
    from public.devices d
   where d.id = any(p_device_ids)
     and d.venue_id = p_venue_id
     and d.status = 'active'
   order by d.id
   for update;

  get diagnostics v_device_count = row_count;

  if v_device_count <> cardinality(p_device_ids) then
    raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform 1
    from public.media_assets a
   where a.id = p_media_asset_id
     and a.venue_id = p_venue_id
     and a.status = 'ready';

  if not found then
    raise exception 'MEDIA_ASSET_NOT_READY_OR_NOT_IN_VENUE' using errcode = '23503';
  end if;

  -- One timestamp is shared by every assignment in this operation.
  v_started_at := clock_timestamp();

  foreach v_device_id in array p_device_ids loop
    return query
    insert into public.device_assignments (
      device_id, venue_id, media_asset_id, revision, started_at, image_duration_ms
    )
    values (
      v_device_id, p_venue_id, p_media_asset_id, 1, v_started_at, p_image_duration_ms
    )
    on conflict (device_id) do update
      set media_asset_id = excluded.media_asset_id,
          revision = public.device_assignments.revision + 1,
          started_at = excluded.started_at,
          image_duration_ms = excluded.image_duration_ms,
          updated_at = v_started_at
    returning *;
  end loop;
end;
$$;

revoke all on function public.assign_media_to_devices(uuid, uuid[], uuid, integer) from public, anon, authenticated;
grant execute on function public.assign_media_to_devices(uuid, uuid[], uuid, integer) to service_role;
