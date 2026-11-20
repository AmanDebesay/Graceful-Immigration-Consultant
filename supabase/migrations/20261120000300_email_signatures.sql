-- Branded email signatures, the same design as the Outlook signature, built per staff member.
-- profiles.email_sig: { credentials, title, college_id, phone, location, footer }   (each person edits their own in My profile)
-- Name, business name, website and logo come from the profile and Business Settings.
alter table public.profiles add column if not exists email_sig jsonb not null default '{}'::jsonb;
grant update (email_sig) on public.profiles to authenticated;   -- profiles_update_self limits it to your own row

-- The owner's signature, as it is in Outlook today.
update public.profiles set email_sig = jsonb_build_object(
  'credentials', 'RCIC-IRB',
  'title', 'Founder & Regulated Canadian Immigration Consultant',
  'college_id', 'R1056136',
  'phone', '403-915-4230',
  'location', 'Lethbridge, Alberta | Serving clients across Canada',
  'footer', 'I respectfully acknowledge that I live and work on Treaty 7 Territory, the traditional lands of the Blackfoot Confederacy (Siksika, Kainai, and Piikani), the Tsuut''ina, and the Stoney Nakoda First Nations, and home to the Métis people.')
where lower(email) = 'aman.debesay@gracefulimmigration.ca' and email_sig = '{}'::jsonb;
