-- Atomic assignment update: all devices sharing one asset use the same
-- server-generated UTC start time when this function is called per device.
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

-- Enable database change broadcasts for player configuration reconciliation.
do $$
begin
  alter publication supabase_realtime add table public.device_assignments;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication is not available; enable it in Supabase before using realtime updates';
end;
$$;
