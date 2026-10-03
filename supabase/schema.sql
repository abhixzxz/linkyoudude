-- Link Your Dude — database schema.
-- Run this once in the Supabase SQL editor (safe to re-run).
--
-- Access model: the browser never talks to these tables. Row Level Security is
-- enabled with no policies, and the functions below are executable only by
-- the service role, which the Next.js API routes use on the server.

create table if not exists public.rooms (
  id text primary key check (id ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{10}$'),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key,
  room_id text not null references public.rooms (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 100000),
  version integer not null default 1 check (version > 0),
  updated_by text check (updated_by is null or char_length(updated_by) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_room_id_created_at_idx
  on public.notes (room_id, created_at desc);

alter table public.rooms enable row level security;
alter table public.notes enable row level security;
revoke all on table public.rooms, public.notes from anon, authenticated;
grant select, insert, update, delete on table public.rooms, public.notes to service_role;

-- Shape returned to the API: camelCase, like the TypeScript Note type.
create or replace function public.lyd_note_json(n public.notes)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', n.id,
    'title', n.title,
    'body', n.body,
    'version', n.version,
    'createdAt', n.created_at,
    'updatedAt', n.updated_at,
    'updatedBy', n.updated_by
  );
$$;

create or replace function public.lyd_touch_room(p_room_id text)
returns void
language sql
set search_path = ''
as $$
  update public.rooms
     set last_active_at = now()
   where id = p_room_id
     and last_active_at < now() - interval '5 minutes';
$$;

create or replace function public.lyd_create_room(p_room_id text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.rooms (id) values (p_room_id);
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

create or replace function public.lyd_get_room(p_room_id text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'room', jsonb_build_object('id', v_room.id, 'createdAt', v_room.created_at),
    'notes', coalesce(
      (select jsonb_agg(public.lyd_note_json(n) order by n.created_at desc)
         from public.notes n
        where n.room_id = p_room_id),
      '[]'::jsonb
    )
  );
end;
$$;

-- Idempotent: retrying a create with the same note ID returns the existing note.
create or replace function public.lyd_create_note(
  p_room_id text,
  p_id uuid,
  p_title text,
  p_body text,
  p_client_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_note public.notes;
begin
  if not exists (select 1 from public.rooms where id = p_room_id) then
    return jsonb_build_object('status', 'room_not_found');
  end if;

  insert into public.notes (id, room_id, title, body, updated_by)
  values (p_id, p_room_id, p_title, p_body, p_client_id)
  on conflict (id) do nothing;

  select * into v_note from public.notes where id = p_id;
  if v_note.room_id is distinct from p_room_id then
    return jsonb_build_object('status', 'id_taken');
  end if;

  perform public.lyd_touch_room(p_room_id);
  return jsonb_build_object('status', 'ok', 'note', public.lyd_note_json(v_note));
end;
$$;

-- Compare-and-set: the write only applies when the caller's base version is
-- still current, so a stale edit can never overwrite a newer one. A null
-- title or body leaves that field unchanged.
create or replace function public.lyd_update_note(
  p_room_id text,
  p_id uuid,
  p_base_version integer,
  p_title text,
  p_body text,
  p_client_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_note public.notes;
begin
  update public.notes
     set title = coalesce(p_title, title),
         body = coalesce(p_body, body),
         version = version + 1,
         updated_by = p_client_id,
         updated_at = now()
   where id = p_id
     and room_id = p_room_id
     and version = p_base_version
  returning * into v_note;

  if found then
    perform public.lyd_touch_room(p_room_id);
    return jsonb_build_object('status', 'ok', 'note', public.lyd_note_json(v_note));
  end if;

  select * into v_note from public.notes where id = p_id and room_id = p_room_id;
  if found then
    return jsonb_build_object('status', 'conflict', 'note', public.lyd_note_json(v_note));
  end if;
  return jsonb_build_object('status', 'not_found');
end;
$$;

create or replace function public.lyd_delete_note(p_room_id text, p_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  delete from public.notes where id = p_id and room_id = p_room_id;
  if found then
    perform public.lyd_touch_room(p_room_id);
    return true;
  end if;
  return false;
end;
$$;

-- Supabase grants new functions to anon/authenticated by default; undo that so
-- only the server (service role) can call them.
revoke execute on function
  public.lyd_note_json(public.notes),
  public.lyd_touch_room(text),
  public.lyd_create_room(text),
  public.lyd_get_room(text),
  public.lyd_create_note(text, uuid, text, text, text),
  public.lyd_update_note(text, uuid, integer, text, text, text),
  public.lyd_delete_note(text, uuid)
from public, anon, authenticated;

grant execute on function
  public.lyd_note_json(public.notes),
  public.lyd_touch_room(text),
  public.lyd_create_room(text),
  public.lyd_get_room(text),
  public.lyd_create_note(text, uuid, text, text, text),
  public.lyd_update_note(text, uuid, integer, text, text, text),
  public.lyd_delete_note(text, uuid)
to service_role;

-- Optional: delete rooms that have been idle for 30 days. Enable the pg_cron
-- extension (Database → Extensions) first, then run:
--
-- select cron.schedule(
--   'lyd-delete-idle-rooms',
--   '0 4 * * *',
--   $$delete from public.rooms where last_active_at < now() - interval '30 days'$$
-- );
