-- 1) Consultation prices have one home: Products & Services (the price list). The two consultation items are linked
--    from Business Settings, and the Business Settings fees are kept equal to them in both directions,
--    so the website, Stripe, agreements and the chat assistant always show the same price.
-- 2) Clients can change the time/length of an unpaid booking, or cancel it, from a private link in their email
--    (only while it is waiting for payment; the payment deadline does not move).

alter table public.org_settings
  add column if not exists consult_item_30 uuid references public.items(id) on delete set null,
  add column if not exists consult_item_60 uuid references public.items(id) on delete set null;

update public.org_settings s set
  consult_item_30 = coalesce(s.consult_item_30, (select id from public.items where name = '30-Minute Consultation' order by created_at limit 1)),
  consult_item_60 = coalesce(s.consult_item_60, (select id from public.items where name = '1-Hour Consultation' order by created_at limit 1))
where id = 1;

-- The price list wins: copy its current prices into Business Settings once.
update public.org_settings s set
  consult_fee_30 = coalesce((select unit_price from public.items where id = s.consult_item_30), s.consult_fee_30),
  consult_fee_60 = coalesce((select unit_price from public.items where id = s.consult_item_60), s.consult_fee_60)
where id = 1;

create or replace function public.consult_fee_from_item() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.org_settings set consult_fee_30 = new.unit_price where id = 1 and consult_item_30 = new.id and consult_fee_30 is distinct from new.unit_price;
  update public.org_settings set consult_fee_60 = new.unit_price where id = 1 and consult_item_60 = new.id and consult_fee_60 is distinct from new.unit_price;
  return new;
end $$;
drop trigger if exists items_consult_fee on public.items;
create trigger items_consult_fee after update of unit_price on public.items
  for each row when (old.unit_price is distinct from new.unit_price) execute function public.consult_fee_from_item();

create or replace function public.consult_item_from_fee() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.consult_item_30 is not null and new.consult_fee_30 is distinct from old.consult_fee_30 then
    update public.items set unit_price = new.consult_fee_30 where id = new.consult_item_30 and unit_price is distinct from new.consult_fee_30;
  end if;
  if new.consult_item_60 is not null and new.consult_fee_60 is distinct from old.consult_fee_60 then
    update public.items set unit_price = new.consult_fee_60 where id = new.consult_item_60 and unit_price is distinct from new.consult_fee_60;
  end if;
  return new;
end $$;
drop trigger if exists org_settings_consult_fee on public.org_settings;
create trigger org_settings_consult_fee after update of consult_fee_30, consult_fee_60 on public.org_settings
  for each row execute function public.consult_item_from_fee();

-- Private link for the client to change or cancel an unpaid booking (only the booking function reads it).
alter table public.pending_bookings add column if not exists manage_token text unique;
