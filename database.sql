-- Jalankan SEKALI di Supabase SQL Editor pada project baru.
-- Tidak menyimpan nama/NIK atau hubungan pilihan calon dengan kode undangan.
begin;
create schema if not exists election_private;
revoke all on schema election_private from public, anon, authenticated;
create table election_private.settings(id boolean primary key default true check(id), is_open boolean not null default false);
insert into election_private.settings(id,is_open) values(true,false);
create table election_private.admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table election_private.invitations(
  token_hash text primary key,
  used boolean not null default false,
  receipt uuid unique
);
create table election_private.totals(candidate integer primary key check(candidate between 1 and 4), votes bigint not null default 0 check(votes>=0));
insert into election_private.totals(candidate) values(1),(2),(3),(4);
alter table election_private.settings enable row level security;
alter table election_private.admins enable row level security;
alter table election_private.invitations enable row level security;
alter table election_private.totals enable row level security;
revoke all on all tables in schema election_private from public,anon,authenticated;

create or replace function election_private.assert_admin() returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from election_private.admins where user_id=auth.uid()) then
    raise exception 'Akun ini bukan petugas.';
  end if;
end; $$;
revoke all on function election_private.assert_admin() from public,anon,authenticated;

create or replace function public.check_invitation(p_token text) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from election_private.invitations i
    where i.token_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex')
    and not i.used)
    and (select is_open from election_private.settings where id=true);
$$;

create or replace function public.cast_ballot(p_token text,p_candidate integer,p_receipt uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare invitation election_private.invitations; opened boolean;
begin
  if p_candidate is null or p_candidate not between 1 and 4 or p_receipt is null then raise exception 'Pilihan tidak valid.'; end if;
  -- Lock baris status agar penutupan pemilihan dan transaksi suara konsisten.
  select is_open into opened from election_private.settings where id=true for share;
  select * into invitation from election_private.invitations
    where token_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex') for update;
  if not found then raise exception 'Kode tidak valid.'; end if;
  -- Retry dengan receipt yang sama tidak menambah suara lagi, termasuk setelah tutup.
  if invitation.used then
    if invitation.receipt=p_receipt then return true; end if;
    raise exception 'Kode sudah digunakan.';
  end if;
  if not opened then raise exception 'Pemilihan sedang ditutup.'; end if;
  update election_private.invitations set used=true,receipt=p_receipt where token_hash=invitation.token_hash;
  update election_private.totals set votes=votes+1 where candidate=p_candidate;
  return true;
end; $$;

create or replace function public.admin_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform election_private.assert_admin();
  return pg_catalog.jsonb_build_object(
    'counts',(select pg_catalog.jsonb_agg(votes order by candidate) from election_private.totals),
    'issued',(select count(*) from election_private.invitations),
    'used',(select count(*) from election_private.invitations where used),
    'open',(select is_open from election_private.settings where id=true));
end; $$;

create or replace function public.admin_issue(p_count integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t text; codes text[]:='{}'; i integer;
begin
  perform election_private.assert_admin();
  if p_count is null or p_count<1 or p_count>200 then raise exception 'Jumlah harus 1–200.'; end if;
  for i in 1..p_count loop
    t:='MM-'||pg_catalog.gen_random_uuid()::text;
    insert into election_private.invitations(token_hash) values(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(t,'UTF8')),'hex'));
    codes:=pg_catalog.array_append(codes,t);
  end loop;
  return pg_catalog.to_jsonb(codes);
end; $$;

create or replace function public.admin_set_open(p_open boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform election_private.assert_admin();
  if p_open is null then raise exception 'Status tidak valid.'; end if;
  update election_private.settings set is_open=p_open where id=true;
  return p_open;
end; $$;

revoke all on function public.check_invitation(text) from public,anon,authenticated;
revoke all on function public.cast_ballot(text,integer,uuid) from public,anon,authenticated;
revoke all on function public.admin_summary() from public,anon,authenticated;
revoke all on function public.admin_issue(integer) from public,anon,authenticated;
revoke all on function public.admin_set_open(boolean) from public,anon,authenticated;
grant execute on function public.check_invitation(text) to anon,authenticated;
grant execute on function public.cast_ballot(text,integer,uuid) to anon,authenticated;
grant execute on function public.admin_summary() to authenticated;
grant execute on function public.admin_issue(integer) to authenticated;
grant execute on function public.admin_set_open(boolean) to authenticated;
commit;

-- SETELAH membuat akun petugas di Authentication > Users:
-- Ganti email di bawah, lalu jalankan SELECT/INSERT ini secara terpisah.
-- insert into election_private.admins(user_id)
-- select id from auth.users where email='email-petugas@contoh.com'
-- on conflict do nothing;
