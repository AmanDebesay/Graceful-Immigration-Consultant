-- Closing date for the books (as in QuickBooks): nothing dated on or before it can be added, changed or deleted.
-- Voids still work, because a void is dated the day it is made. Bank reconciliation (cleared / reconciled) is allowed.
-- Only the owner sets or moves the closing date, and every change is in the audit log.
alter table public.org_settings add column if not exists books_closed_through date;

create or replace function public._books_closed() returns date
language sql stable security definer set search_path = public as $$
  select books_closed_through from public.org_settings where id = 1
$$;

create or replace function public.books_period_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c date := public._books_closed(); d_old date; d_new date;
begin
  if c is null or coalesce(current_setting('gi.books', true), '') = 'override' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'journal_entries' then
    if tg_op <> 'INSERT' then d_old := old.entry_date; end if;
    if tg_op <> 'DELETE' then d_new := new.entry_date; end if;
  else
    -- Reconciling the bank (ticking lines cleared) is not a change to the books.
    if tg_op = 'UPDATE' and (new.entry_id, new.account_id, new.debit, new.credit, new.contact_id, new.vendor_id, new.description)
        is not distinct from (old.entry_id, old.account_id, old.debit, old.credit, old.contact_id, old.vendor_id, old.description) then
      return new;
    end if;
    if tg_op <> 'INSERT' then select entry_date into d_old from public.journal_entries where id = old.entry_id; end if;
    if tg_op <> 'DELETE' then select entry_date into d_new from public.journal_entries where id = new.entry_id; end if;
  end if;
  if d_old <= c or d_new <= c then
    raise exception 'The books are closed through %. Use a date after that, or void it (a void is dated today). The owner can move the closing date in Accounting.', to_char(c, 'FMMonth FMDD, YYYY');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists books_period_entries on public.journal_entries;
create trigger books_period_entries before insert or update or delete on public.journal_entries for each row execute function public.books_period_guard();
drop trigger if exists books_period_lines on public.journal_lines;
create trigger books_period_lines before insert or update or delete on public.journal_lines for each row execute function public.books_period_guard();

create or replace function public.set_books_closing(p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare v_old date := public._books_closed();
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and role = 'owner') then
    raise exception 'Only the owner can change the closing date.';
  end if;
  if p_date is not null and p_date > (now() at time zone 'America/Edmonton')::date then
    raise exception 'The closing date can''t be in the future.';
  end if;
  update public.org_settings set books_closed_through = p_date where id = 1;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'books_closing_changed', 'org_settings', '1', jsonb_build_object('from', v_old, 'to', p_date));
end $$;
revoke execute on function public.set_books_closing(date) from public, anon;
grant execute on function public.set_books_closing(date) to authenticated;
