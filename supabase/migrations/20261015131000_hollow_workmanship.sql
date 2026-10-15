-- Add a structured hollow-sound finding to new inspection submissions.
-- All existing templates, inspections, request identities and permissions stay
-- in place. The Phase 3C implementation continues enforcing every hold rule.
begin;

do $$ begin
 if to_regprocedure('public.record_location_inspection(uuid,jsonb)') is null
  or to_regprocedure('private.phase3c_record_location_inspection(uuid,jsonb)') is not null then
  raise exception 'Preflight failed: expected the existing Phase 3C inspection function';
 end if;
end $$;

alter function public.record_location_inspection(uuid,jsonb) set schema private;
alter function private.record_location_inspection(uuid,jsonb) rename to phase3c_record_location_inspection;
revoke all on function private.phase3c_record_location_inspection(uuid,jsonb) from public, anon, authenticated;

create function public.record_location_inspection(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid:=(p_data->>'contract_id')::uuid;
 t public.location_inspection_templates; checks jsonb; answer jsonb; answers jsonb:='[]'; n integer:=0; note text;
 investigation constant text:='Hollow-sounding tile found. Investigate against the installation system and project requirements.';
begin
 if not private.can_supervise_contract(c) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
 if jsonb_typeof(p_data->'answers')='array' then
  select * into t from public.location_inspection_templates where id=(p_data->>'template_id')::uuid and contract_id=c and organisation_id=org;
  select jsonb_agg(value order by ord) into checks from jsonb_array_elements(t.checklist) with ordinality item(value,ord)
   where not (value->>'wet_only')::boolean or t.wet_area;
  for answer in select value from jsonb_array_elements(p_data->'answers') loop
   if answer ? 'hollow_found' then
    if jsonb_typeof(answer->'hollow_found') is distinct from 'boolean'
     or coalesce(checks->n->>'label','') !~* '\m(hollow|drummy)\M' then
     raise exception 'A hollow-sound finding must answer the applicable hollow-sounding tile check' using errcode='22023';
    end if;
    if (answer->>'hollow_found')::boolean then
     if jsonb_typeof(answer->'note') is distinct from 'string' or length(answer->>'note')>2000 then
      raise exception 'Record a short observation for this finding' using errcode='22023';
     end if;
     note:=trim(answer->>'note');
     if position(investigation in note)<>1 then note:=investigation||case when note<>'' then ' '||note else '' end; end if;
     if length(note)>2000 then raise exception 'Keep the observation and investigation note within 2000 characters' using errcode='22023'; end if;
     answer:=answer||jsonb_build_object('status','issue','note',note);
    end if;
    answer:=answer-'hollow_found';
   end if;
   answers:=answers||jsonb_build_array(answer); n:=n+1;
  end loop;
  p_data:=jsonb_set(p_data,'{answers}',answers);
 end if;
 -- The original checked implementation still derives labels, actor, scope,
 -- evidence, issue count, workforce links and immutable history in one tx.
 return private.phase3c_record_location_inspection(p_request_key,p_data);
end $$;

revoke all on function public.record_location_inspection(uuid,jsonb) from public,anon;
grant execute on function public.record_location_inspection(uuid,jsonb) to authenticated;
commit;
