-- Deleting pathway assessments.
-- Drafts: anyone who can fill them in (pathway.edit). Final assessments: only the RCIC (pathway.finalize), with a reason.
-- Every delete is written to the audit log (number, client, top route, reason). Deleting a contact still can't
-- silently remove a final assessment: the guard only lets a final one go through this function.
create or replace function public.pathway_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'final' and current_setting('gi.pathway_delete', true) is distinct from old.id::text then
      raise exception 'A final pathway assessment is part of the client file. The RCIC can delete it from the assessment page.';
    end if;
    return old;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  new.created_by := old.created_by; new.number := old.number; new.created_at := old.created_at;
  if old.status = 'final' and new.status = 'final' then
    raise exception 'This assessment is final. Reopen it to make changes.';
  end if;
  if new.status <> old.status then
    if auth.uid() is not null and not public.has_perm('pathway.finalize') then
      raise exception 'Only the RCIC can finalize or reopen an assessment.';
    end if;
    if new.status = 'final' then new.finalized_by := auth.uid(); new.finalized_at := now();
    else new.finalized_by := null; new.finalized_at := null; end if;
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values (auth.uid(), case when new.status = 'final' then 'pathway_finalized' else 'pathway_reopened' end, 'pathway_assessment', new.id,
            jsonb_build_object('number', new.number, 'contact_id', new.contact_id, 'top_route', new.top_route));
  end if;
  return new;
end $$;

create or replace function public.delete_pathway_assessment(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v public.pathway_assessments; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v from public.pathway_assessments where id = p_id for update;
  if not found then raise exception 'Assessment not found.'; end if;
  if v.status = 'final' then
    if not public.has_perm('pathway.finalize') then raise exception 'Only the RCIC can delete a final assessment.'; end if;
    if v_reason is null then raise exception 'Give a reason for deleting a final assessment.'; end if;
  elsif not public.has_perm('pathway.edit') then
    raise exception 'You don''t have permission to delete assessments.';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'pathway_deleted', 'pathway_assessment', v.id,
          jsonb_build_object('number', v.number, 'status', v.status, 'contact_id', v.contact_id, 'top_route', v.top_route, 'reason', v_reason));
  perform set_config('gi.pathway_delete', v.id::text, true);
  delete from public.pathway_assessments where id = p_id;
  perform set_config('gi.pathway_delete', '', true);
end $$;
revoke all on function public.delete_pathway_assessment(uuid, text) from public, anon;
grant execute on function public.delete_pathway_assessment(uuid, text) to authenticated;
