import { icon } from '../core.js';

const INFO = {
  agreements: ['Agreements', 'Generate consultation and retainer agreements from your templates with client details filled in, send them for e-signature in the client portal, and track sent / viewed / signed.'],
  finance: ['Finance', 'Invoices with GST, payment recording, trust (client) funds vs earned fees, expenses, profit & loss and unpaid-invoice reports, with export to QuickBooks.'],
};

export async function render(el) {
  const key = location.hash.includes('finance') ? 'finance' : 'agreements';
  const [title, text] = INFO[key];
  el.innerHTML = `<div class="card" style="max-width:640px"><div class="card-b empty" style="padding:56px 32px">
    ${icon(key === 'finance' ? 'dollar' : 'file')}<h2 style="color:var(--navy);margin:6px 0 10px">${title} is coming next</h2>
    <p style="max-width:460px;margin:0 auto">${text}</p></div></div>`;
}
