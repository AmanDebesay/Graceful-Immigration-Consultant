-- New staff role for the marketing / graphics / social media team member (no client data by default).
-- On its own because a new enum value cannot be used in the same transaction that adds it.
alter type public.app_role add value if not exists 'marketing';
