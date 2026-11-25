-- Consultation fees: $75 for 30 minutes, $150 for 1 hour (was $30 / $60).
update public.org_settings set consult_fee_30 = 75, consult_fee_60 = 150 where id = 1;
update public.items set unit_price = 75  where name = '30-Minute Consultation';
update public.items set unit_price = 150 where name = '1-Hour Consultation';
