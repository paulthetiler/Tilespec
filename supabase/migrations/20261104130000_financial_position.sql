-- One financial position per contract (C5). Money access only.
--
-- Worked out entirely from saved records, every time it is asked for; nothing here is stored.
--   Value:    the original contract value, plus agreed extras = dayworks and variations the office
--             approved, whose charge was approved internally, and which the client authorised where
--             the contract requires it (at the approved price). Extras priced but not yet agreed are
--             shown separately as pending and are not in the revised value.
--   Cost:     labour from attendance at the rates in force, plus purchases and invoices.
--   Forecast: cost to date plus whatever of the original cost budget is not yet spent (never less
--             than nothing), and the contingency reserve held back, as the original budget does.
--   Payment:  the latest application submitted, the latest certificate, retention held, payments
--             received and what is outstanding against the certificate.
--   Warnings: hours without a rate, people still on site, extras not yet priced, and subcontract
--             invoices from a company whose people are also costed from attendance.
-- Additive and transactional. Review before hosted use.
begin;
do $$ begin
  if to_regprocedure('private.payment_application_figures(uuid)') is null or to_regprocedure('private.labour_cost_lines(uuid)') is null
    or to_regprocedure('private.client_authorisation_required(uuid,text)') is null then
    raise exception 'Preflight failed: payment applications (20261104120000), job costs and the commercial boundary are required';
  end if;
  if to_regprocedure('public.contract_financial_positions(uuid[])') is not null or to_regprocedure('private.contract_financial_position(uuid)') is not null then
    raise exception 'Preflight failed: financial position objects already exist; review schema drift';
  end if;
end $$;

create function private.contract_financial_position(p_contract uuid)
returns table(contract_id uuid,has_budget boolean,original_value numeric,budget_cost numeric,contingency numeric,target_margin numeric,retention_percent numeric,
  extras_agreed numeric,extras_agreed_count integer,extras_pending numeric,extras_pending_count integer,extras_unpriced_count integer,revised_value numeric,
  labour_cost numeric,labour_hours_without_rate numeric,labour_still_on_site integer,materials_cost numeric,subcontract_cost numeric,plant_cost numeric,other_cost numeric,
  actual_cost numeric,forecast_cost numeric,forecast_profit numeric,forecast_margin numeric,budget_profit numeric,budget_margin numeric,
  applied_gross numeric,certified_gross numeric,certified_net numeric,retention_held numeric,received numeric,outstanding numeric,subcontract_overlap integer)
language sql stable security definer set search_path='' as $$
  with k as (
    select c.contract_value,c.labour_budget+c.materials_budget+c.preliminaries_budget as budget_cost,c.contingency,c.target_margin,c.retention_percent
    from public.contract_commercials c where c.contract_id=p_contract
  ), extras as (
    select d.id,d.office_status,d.client_status,d.commercial_status,
      (d.office_status='approved' and d.commercial_status='commercially_approved'
        and (d.client_status='authorised' or not private.client_authorisation_required(d.contract_id,d.kind))) as agreed,
      (select p.total from public.daywork_commercial_approvals a join public.daywork_pricings p on p.id=a.pricing_id where a.daywork_id=d.id) as approved_total,
      (select p.total from public.daywork_pricings p where p.daywork_id=d.id and p.lines_version=d.lines_version order by p.priced_at desc,p.id desc limit 1) as latest_total
    from public.dayworks d
    where d.contract_id=p_contract and d.office_status is distinct from 'rejected' and d.client_status<>'declined'
  ), x as (
    select coalesce(sum(approved_total) filter (where agreed),0) as agreed,count(*) filter (where agreed)::integer as agreed_count,
      coalesce(sum(coalesce(approved_total,latest_total)) filter (where not agreed and commercial_status<>'awaiting_pricing'),0) as pending,
      count(*) filter (where not agreed and commercial_status<>'awaiting_pricing')::integer as pending_count,
      count(*) filter (where commercial_status='awaiting_pricing' and office_status is not null)::integer as unpriced_count
    from extras
  ), lines as (
    select * from private.labour_cost_lines(p_contract)
  ), l as (
    select coalesce(sum(cost) filter (where status='costed'),0) as cost,coalesce(sum(hours) filter (where status='no_rate'),0) as no_rate_hours,
      count(*) filter (where status='open')::integer as open from lines
  ), j as (
    select coalesce(sum(net_amount) filter (where category='materials'),0) as materials,coalesce(sum(net_amount) filter (where category='subcontract'),0) as subcontract,
      coalesce(sum(net_amount) filter (where category='plant'),0) as plant,coalesce(sum(net_amount) filter (where category='other'),0) as other
    from public.job_cost_entries where contract_id=p_contract and voided_at is null
  ), apps as (
    select * from private.payment_application_figures(p_contract)
  ), p as (
    select (select a.gross from apps a where a.status in ('submitted','certified') order by a.number desc limit 1) as applied,
      (select a.certified_gross from apps a where a.status='certified' order by a.number desc limit 1) as certified_gross,
      (select a.certified_net from apps a where a.status='certified' order by a.number desc limit 1) as certified_net,
      (select a.certified_retention from apps a where a.status='certified' order by a.number desc limit 1) as retention,
      (select coalesce(sum(r.amount),0) from public.payment_receipts r where r.contract_id=p_contract and r.voided_at is null) as received
  ), overlap as (
    select count(*)::integer as n from public.job_cost_entries e
    where e.contract_id=p_contract and e.voided_at is null and e.category='subcontract' and e.company_id is not null
      and exists(select 1 from lines ln left join public.operatives o on ln.subject='operative' and o.id=ln.subject_id
        left join public.teams t on ln.subject='team' and t.id=ln.subject_id
        where ln.status='costed' and coalesce(o.company_id,t.company_id)=e.company_id)
  ), totals as (
    select (select count(*)>0 from k) as has_budget,coalesce((select contract_value from k),0) as original_value,coalesce((select budget_cost from k),0) as budget_cost,
      coalesce((select contingency from k),0) as contingency,(select target_margin from k) as target_margin,coalesce((select retention_percent from k),0) as retention_percent,
      x.*,l.cost as labour,l.no_rate_hours,l.open,j.*,p.*,overlap.n as overlap_count,
      l.cost+j.materials+j.subcontract+j.plant+j.other as actual
    from x,l,j,p,overlap
  )
  select p_contract,t.has_budget,t.original_value,t.budget_cost,t.contingency,t.target_margin,t.retention_percent,
    t.agreed,t.agreed_count,t.pending,t.pending_count,t.unpriced_count,t.original_value+t.agreed,
    t.labour,t.no_rate_hours,t.open,t.materials,t.subcontract,t.plant,t.other,t.actual,
    t.actual+greatest(t.budget_cost-t.actual,0),
    t.original_value+t.agreed-(t.actual+greatest(t.budget_cost-t.actual,0))-t.contingency,
    case when t.original_value+t.agreed>0 then round((t.original_value+t.agreed-(t.actual+greatest(t.budget_cost-t.actual,0))-t.contingency)*100/(t.original_value+t.agreed),2) end,
    t.original_value-t.budget_cost-t.contingency,
    case when t.original_value>0 then round((t.original_value-t.budget_cost-t.contingency)*100/t.original_value,2) end,
    t.applied,t.certified_gross,t.certified_net,t.retention,t.received,
    case when t.certified_net is null then null else t.certified_net-t.received end,
    t.overlap_count
  from totals t
$$;

-- Every job the caller may see the money for, in one call. Others are left out, as with RLS.
create function public.contract_financial_positions(p_contracts uuid[])
returns table(contract_id uuid,has_budget boolean,original_value numeric,budget_cost numeric,contingency numeric,target_margin numeric,retention_percent numeric,
  extras_agreed numeric,extras_agreed_count integer,extras_pending numeric,extras_pending_count integer,extras_unpriced_count integer,revised_value numeric,
  labour_cost numeric,labour_hours_without_rate numeric,labour_still_on_site integer,materials_cost numeric,subcontract_cost numeric,plant_cost numeric,other_cost numeric,
  actual_cost numeric,forecast_cost numeric,forecast_profit numeric,forecast_margin numeric,budget_profit numeric,budget_margin numeric,
  applied_gross numeric,certified_gross numeric,certified_net numeric,retention_held numeric,received numeric,outstanding numeric,subcontract_overlap integer)
language sql stable security definer set search_path='' as $$
  select f.* from (select distinct u.id from unnest(p_contracts) u(id) where private.can_view_financials(u.id)) c
  cross join lateral private.contract_financial_position(c.id) f
$$;

revoke all on function private.contract_financial_position(uuid) from public,anon,authenticated;
revoke all on function public.contract_financial_positions(uuid[]) from public,anon;
grant execute on function public.contract_financial_positions(uuid[]) to authenticated;
commit;
