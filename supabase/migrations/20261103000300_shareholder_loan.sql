-- Money the owner puts into the corporation (or takes back) is a loan from the shareholder, not income or equity.
-- Recorded with Banking → Transfer: from "Shareholder Loan" to the bank (money in), and back again when repaid.
insert into public.accounts (code, name, type, subtype, system_key, description) values
  ('2500', 'Shareholder Loan (Due to Shareholder)', 'liability', 'shareholder_loan', 'shareholder_loan',
   'Money the shareholder has advanced to the corporation. Repayments reduce it; the balance is what the company owes the shareholder.')
on conflict (code) do nothing;
