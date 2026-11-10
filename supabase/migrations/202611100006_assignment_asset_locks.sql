-- Re-apply assignment functions with shared row locks on media assets.
-- This is a forward-only migration for projects that may already have applied
-- the initial assignment migrations before the safe-delete locking change.
create or replace function public.assign_media_to_device(
  p_device_id uuid,
  p_media_asset_id uuid,
  p_image_duration_ms integer default 10000
)
returns public.device_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
  v_asset public.media_assets%rowtype;
  v_assignment public.device_assignments%rowtype;
begin
  if p_image_duration_ms < 1000 or p_image_duration_ms > 3600000 then
    raise exception 'IMAGE_DURATION_OUT_OF_RANGE' using errcode = '22023';
  end if;

  select d.venue_id
    into v_venue_id
    from public.devices d
   where d.id = p_device_id
     and d.status = 'active'
   for update;

  if v_venue_id is null then
    raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_asset
    from public.media_assets a
   where a.id = p_media_asset_id
     and a.venue_id = v_venue_id
     and a.status = 'ready'
   for share;

  if not found then
    raise exception 'MEDIA_ASSET_NOT_READY_OR_NOT_IN_VENUE' using errcode = '23503';
  end if;

  insert into public.device_assignments (
    device_id, venue_id, media_asset_id, revision, started_at, image_duration_ms
  )
  values (
    p_device_id, v_venue_id, p_media_asset_id, 1, now(), p_image_duration_ms
  )
  on conflict (device_id) do update
    set media_asset_id = excluded.media_asset_id,
        revision = public.device_assignments.revision + 1,
        started_at = excluded.started_at,
        image_duration_ms = excluded.image_duration_ms,
        updated_at = now()
  returning * into v_assignment;

  return v_assignment;
end;
$$;


revoke all on function public.assign_media_to_device(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.assign_media_to_device(uuid, uuid, integer) to service_role;

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
  v_assignment public.device_assignments%rowtype;
begin
  if p_device_ids is null
     or cardinality(p_device_ids) < 1
     or cardinality(p_device_ids) > 100
     or cardinality(p_device_ids) <> (
       select count(distinct value) from unnest(p_device_ids) as ids(value)
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
     and a.status = 'ready'
   for share;

  if not found then
    raise exception 'MEDIA_ASSET_NOT_READY_OR_NOT_IN_VENUE' using errcode = '23503';
  end if;

  -- One timestamp is shared by every assignment in this operation.
  v_started_at := clock_timestamp();

  foreach v_device_id in array p_device_ids loop
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
    returning * into v_assignment;

    return next v_assignment;
  end loop;
end;
$$;


revoke all on function public.assign_media_to_devices(uuid, uuid[], uuid, integer) from public, anon, authenticated;
grant execute on function public.assign_media_to_devices(uuid, uuid[], uuid, integer) to service_role;
