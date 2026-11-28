// Official receipt in the Graceful letter format: the page, print, the PDF attachment and the email all come from here.
const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
const longDate = (d) => (d ? new Date(String(d).length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
export const SITE = 'https://gracefulimmigration.ca';
const img = (name) => `${location.origin}/public/img/${name}`;   // same origin, so the PDF can draw it

// "Three hundred dollars and 00/100"
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n) {
  if (n === 0) return 'zero';
  const under1000 = (x) => [x >= 100 ? `${ONES[Math.floor(x / 100)]} hundred` : '', x % 100 < 20 ? ONES[x % 100] : `${TENS[Math.floor((x % 100) / 10)]}${x % 10 ? '-' + ONES[x % 10] : ''}`].filter(Boolean).join(' ');
  const parts = [];
  for (const [size, label] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [1, '']]) {
    const chunk = Math.floor(n / size) % 1000; if (chunk) parts.push(`${under1000(chunk)}${label ? ' ' + label : ''}`);
  }
  return parts.join(' ');
}
export const amountWords = (a) => { const c = Math.round(Number(a || 0) * 100); const w = words(Math.floor(c / 100)); return `${w.charAt(0).toUpperCase() + w.slice(1)} dollars and ${String(c % 100).padStart(2, '0')}/100`; };

const STYLE = `<style>
.gr{font-family:Arial,Helvetica,sans-serif;color:#1C2333;background:#fff;width:816px;box-sizing:border-box;padding:46px 54px 40px;position:relative;font-size:13px;line-height:1.5}
.gr *{box-sizing:border-box}
.gr-head{display:flex;align-items:center;gap:22px}
.gr-head img{width:118px;height:auto;display:block}
.gr-org{flex:1;text-align:right;font-size:12px;color:#4A5468;line-height:1.55}
.gr-org b{display:block;font-family:Georgia,'Times New Roman',serif;font-size:19px;color:#0B2A5C;margin-bottom:3px}
.gr-rule{height:4px;border-top:2.5px solid #C9A24A;border-bottom:1px solid #0B2A5C;margin:16px 0 22px}
.gr-title{text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:27px;letter-spacing:.22em;color:#0B2A5C;font-weight:bold}
.gr-orn{text-align:center;color:#C9A24A;font-size:13px;margin:2px 0 14px;letter-spacing:.6em}
.gr-meta{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:22px}
.gr-meta span{border:1px solid #E3CF9A;border-radius:20px;padding:4px 14px;font-size:12px;color:#4A5468;background:#FFFDF7}
.gr-meta b{color:#0B2A5C}
.gr-parties{display:grid;grid-template-columns:1fr 1fr;border:1px solid #E3DCCD;border-radius:10px;overflow:hidden;margin-bottom:18px}
.gr-parties>div{padding:14px 18px}.gr-parties>div+div{border-left:1px solid #E3DCCD;background:#FCFAF5}
.gr-lbl{display:block;font-size:10px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;color:#9A7420;margin-bottom:5px}
.gr-nm{display:block;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#0B2A5C;font-weight:bold;margin-bottom:2px}
.gr-amt{display:flex;align-items:center;justify-content:space-between;background:#0B2A5C;color:#fff;border-radius:10px;padding:16px 22px;margin-bottom:6px}
.gr-amt small{display:block;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#E8D49B;font-weight:bold}
.gr-amt b{font-family:Georgia,'Times New Roman',serif;font-size:32px;letter-spacing:.01em}
.gr-words{text-align:right;font-style:italic;color:#4A5468;font-size:12px;margin-bottom:18px}
.gr table{width:100%;border-collapse:collapse;margin-bottom:6px}
.gr th{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#9A7420;text-align:left;border-bottom:1.5px solid #0B2A5C;padding:7px 8px}
.gr td{padding:9px 8px;border-bottom:1px solid #EEE8DB;vertical-align:top}
.gr .r{text-align:right;white-space:nowrap}
.gr tfoot td{border-bottom:0;padding:5px 8px}.gr tfoot tr.tot td{border-top:1.5px solid #0B2A5C;font-weight:bold;color:#0B2A5C;font-size:15px;padding-top:9px}
.gr-note{background:#FCFAF5;border-left:3px solid #C9A24A;padding:10px 14px;margin:14px 0;font-size:12px;color:#4A5468;border-radius:0 8px 8px 0}
.gr-sig{display:flex;justify-content:space-between;align-items:flex-end;gap:30px;margin-top:30px}
.gr-sig .who{width:300px}.gr-sig .ink{height:70px;display:flex;align-items:flex-end}
.gr-sig .ink img{max-height:68px;max-width:280px}.gr-sig .typed{font-family:'Brush Script MT','Segoe Script',cursive;font-size:34px;color:#0B2A5C;line-height:1}
.gr-sig .line{border-top:1px solid #1C2333;margin-top:4px;padding-top:6px;font-size:12px;color:#4A5468;line-height:1.5}
.gr-sig .line b{color:#1C2333;font-size:13px}
.gr-stamp{text-align:center;border:2px solid #C9A24A;color:#9A7420;border-radius:50%;width:112px;height:112px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;letter-spacing:.12em;font-weight:bold;transform:rotate(-8deg)}
.gr-stamp b{font-family:Georgia,serif;font-size:17px;letter-spacing:.08em;color:#0B2A5C}
.gr-foot{margin-top:28px;border-top:1px solid #E3DCCD;padding-top:10px;text-align:center;font-size:10.5px;color:#6B7385;line-height:1.6}
@media print{@page{size:letter;margin:0}}
.gr-void{position:absolute;top:38%;left:0;right:0;text-align:center;font-size:110px;font-weight:bold;color:rgba(217,45,32,.16);transform:rotate(-18deg);pointer-events:none;letter-spacing:.1em}
</style>`;

/**
 * m: { org, number, date, amount, method, reference, kind ('payment'|'trust'), memo, voided,
 *      from: { name, lines[] }, client (name or '' when the client paid), apps: [{ number, date, total, paid, balance }], gst,
 *      issuer: { name, credentials, title }, signature (PNG data URL or typed name), issued (date) }
 */
export function receiptHtml(m) {
  const o = m.org || {};
  const fees = Number(m.amount) - Number(m.gst || 0);
  const rows = m.desc?.title || m.desc?.detail
    ? `<tr><td><b>${e(m.desc.title || '')}</b>${m.desc.detail ? `<br><span style="color:#6B7385">${e(m.desc.detail)}</span>` : ''}</td><td class="r">${money(m.amount)}</td></tr>`
    : m.kind === 'trust'
    ? `<tr><td><b>Retainer paid in advance</b><br><span style="color:#6B7385">Held in the RCIC's client (trust) account until earned${m.client ? `, for services to ${e(m.client)}` : ''}</span></td><td class="r">${money(m.amount)}</td></tr>`
    : m.apps.length ? m.apps.map((a) => `<tr><td><b>Payment toward invoice ${e(a.number)}</b><br><span style="color:#6B7385">Invoice dated ${e(longDate(a.date))} · invoice total ${money(a.total)} · balance remaining ${money(a.balance)}${Number(a.balance) <= 0 ? ' (paid in full)' : ''}</span></td><td class="r">${money(a.paid)}</td></tr>`).join('')
    : `<tr><td><b>Immigration and citizenship services</b>${m.memo ? `<br><span style="color:#6B7385">${e(m.memo)}</span>` : ''}</td><td class="r">${money(m.amount)}</td></tr>`;
  const sig = String(m.signature || '');
  return `${STYLE}<div class="gr">${m.voided ? '<div class="gr-void">VOID</div>' : ''}
  <div class="gr-head"><img src="${img('logo-full.png')}" alt="Graceful Immigration Consultant Inc.">
    <div class="gr-org"><b>${e(o.business_name)}</b>${e(o.address)}<br>${e(o.phone)} · ${e(o.email)}<br>www.gracefulimmigration.ca<br>${e(o.rcic_name)}, RCIC-IRB · CICC College ID ${e(o.licence_number)}${o.gst_number ? `<br>GST/HST No. ${e(o.gst_number)}` : ''}</div></div>
  <div class="gr-rule"></div>
  <div class="gr-title">OFFICIAL RECEIPT</div><div class="gr-orn">✦ ✦ ✦</div>
  <div class="gr-meta"><span>Receipt no. <b>${e(m.number)}</b></span><span>Date received <b>${e(longDate(m.date))}</b></span><span>Paid by <b>${e(m.method)}</b>${m.reference ? ` · Ref. <b>${e(m.reference)}</b>` : ''}</span></div>
  <div class="gr-parties"><div><span class="gr-lbl">Received from</span><span class="gr-nm">${e(m.from.name)}</span>${(m.from.lines || []).filter(Boolean).map(e).join('<br>')}</div>
    <div><span class="gr-lbl">${m.client ? 'On behalf of client' : 'Client'}</span><span class="gr-nm">${e(m.client || m.from.name)}</span>${m.client ? 'Services are provided to this client.' : 'Payment made by the client.'}</div></div>
  <div class="gr-amt"><div><small>Amount received</small><b>${money(m.amount)}</b></div><div style="text-align:right;font-size:12px;color:#E8D49B">Canadian dollars<br>${m.kind === 'trust' ? 'Held in trust' : 'Applied to fees'}</div></div>
  <div class="gr-words">${e(amountWords(m.amount))} CAD</div>
  <table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody>
    <tfoot>${Number(m.gst) > 0 ? `<tr><td class="r">Professional fees</td><td class="r">${money(fees)}</td></tr><tr><td class="r">GST included</td><td class="r">${money(m.gst)}</td></tr>` : ''}
      <tr class="tot"><td class="r">Total received</td><td class="r">${money(m.amount)}</td></tr></tfoot></table>
  ${m.kind === 'trust' ? '<div class="gr-note">This money is client money held in trust. It is not yet earned: it is used to pay invoices for services once they are provided, as set out in the service agreement, and any unearned amount is refunded in accordance with the College\'s Client Account Regulation.</div>' : ''}
  ${m.client ? `<div class="gr-note">Paid by ${e(m.from.name)} on behalf of ${e(m.client)}. The client remains the person the services are provided to.</div>` : ''}
  ${m.note ? `<div class="gr-note">${e(m.note).replace(/\n/g, '<br>')}</div>` : ''}
  <div class="gr-sig"><div class="who"><div class="ink">${sig.startsWith('data:image') ? `<img src="${sig}" alt="Signature">` : `<span class="typed">${e(sig || m.issuer?.name)}</span>`}</div>
      <div class="line"><b>${e(m.issuer?.name)}${m.issuer?.credentials ? `, ${e(m.issuer.credentials)}` : ''}</b><br>${m.issuer?.title ? `${e(m.issuer.title)}<br>` : ''}${e(o.business_name)}<br>Issued ${e(longDate(m.issued))}</div></div>
    <div class="gr-stamp">${m.voided ? '<b>VOID</b>' : `<span>RECEIVED</span><b>PAID</b><span>WITH THANKS</span>`}</div></div>
  <div class="gr-foot">Thank you for choosing ${e(String(o.business_name || '').replace(/\.$/, ''))}. Please keep this receipt for your records.<br>
    ${e(o.rcic_name)} is a Licensee of the College of Immigration and Citizenship Consultants (CICC) · ${e(o.address)} · www.gracefulimmigration.ca</div></div>`;
}

/** The email around the PDF: letterhead, the message typed in the email box, and a summary of the receipt. */
export function receiptEmailHtml(m, text) {
  const o = m.org || {};
  const esc2 = (t) => e(t).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, '<br>')}</p>`).join('');
  const row = (k, v) => `<tr><td style="padding:7px 12px;color:#6B7385;font-size:13px;border-bottom:1px solid #EEE8DB;width:42%">${k}</td><td style="padding:7px 12px;font-size:13px;color:#1C2333;border-bottom:1px solid #EEE8DB"><b>${v}</b></td></tr>`;
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;font-family:Arial,Helvetica,sans-serif;border-collapse:collapse">
  <tr><td style="padding:0 0 10px"><table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td style="vertical-align:middle;width:96px"><img src="${SITE}/public/img/logo-full.png" width="86" alt="Graceful Immigration Consultant Inc." style="display:block;width:86px;height:auto;border:0"></td>
    <td style="vertical-align:middle;text-align:right;font-size:12px;color:#4A5468;line-height:1.5"><span style="font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#0B2A5C;font-weight:bold">${e(o.business_name)}</span><br>Official receipt ${e(m.number)}</td></tr></table></td></tr>
  <tr><td style="border-top:2.5px solid #C9A24A;border-bottom:1px solid #0B2A5C;height:2px;line-height:2px;font-size:1px">&nbsp;</td></tr>
  <tr><td style="padding:18px 0 4px;font-size:14px;line-height:1.6;color:#1C2333">${esc2(text)}</td></tr>
  <tr><td style="padding:4px 0 6px"><table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #E3DCCD;border-radius:8px;border-collapse:separate;overflow:hidden">
    <tr><td colspan="2" style="background:#0B2A5C;color:#ffffff;padding:12px 14px"><span style="font-size:10px;letter-spacing:2px;color:#E8D49B;font-weight:bold">AMOUNT RECEIVED</span><br><span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:bold">${money(m.amount)} CAD</span></td></tr>
    ${row('Receipt no.', e(m.number))}${row('Date received', e(longDate(m.date)))}${row('Payment method', `${e(m.method)}${m.reference ? ` · ref. ${e(m.reference)}` : ''}`)}
    ${row('Received from', e(m.from.name))}${m.client ? row('On behalf of client', e(m.client)) : ''}
    ${m.kind === 'trust' ? row('For', 'Retainer held in trust until earned') : m.apps.map((a) => row(`Invoice ${e(a.number)}`, `${money(a.paid)} paid · balance ${money(a.balance)}`)).join('')}
    ${Number(m.gst) > 0 ? row('GST included', `${money(m.gst)}${o.gst_number ? ` (GST/HST No. ${e(o.gst_number)})` : ''}`) : ''}</table></td></tr>
  <tr><td style="padding:8px 0 0;font-size:12.5px;color:#4A5468">&#128206; Your official receipt <b>${e(m.number)}.pdf</b> is attached. Please keep it for your records.</td></tr></table>`;
}

const libs = {};
const loadLib = (src, get) => (libs[src] = libs[src] || new Promise((res, rej) => {
  if (get()) return res(get());
  const s = document.createElement('script'); s.src = src;
  s.onload = () => (get() ? res(get()) : rej(new Error('The PDF maker did not load.')));
  s.onerror = () => { delete libs[src]; rej(new Error('Could not load the PDF maker. Check your connection and try again.')); };
  document.head.appendChild(s);
}));

/** Renders the receipt to a Letter-size PDF. Returns { base64, blob }.
 *  The receipt is drawn inside its own 816px-wide frame, so the screen size, zoom and scrolling of the app can't shift or cut it. */
export async function receiptPdf(html) {
  const [h2c, { jsPDF }] = await Promise.all([
    loadLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', () => window.html2canvas),
    loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => window.jspdf),
  ]);
  const W = 816, H = 1056;                                   // US Letter at 96 px per inch
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;border:0;opacity:0;pointer-events:none;z-index:-1`;
  document.body.appendChild(f);
  try {
    const d = f.contentDocument;
    d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${location.href}"></head><body style="margin:0;background:#fff">${html}</body></html>`); d.close();
    await Promise.all([...d.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    await d.fonts?.ready;
    const el = d.querySelector('.gr') || d.body;
    const tall = Math.max(H, el.scrollHeight);
    f.style.height = tall + 'px';
    const canvas = await h2c(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: W, height: tall, windowWidth: W, windowHeight: tall, scrollX: 0, scrollY: 0, x: 0, y: 0 });
    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
    const pw = 612, ph = 792, k = canvas.width / W;          // canvas px per CSS px
    const pages = Math.max(1, Math.ceil((tall - 8) / H));      // a few px over one page stays on one page
    for (let n = 0; n < pages; n++) {
      const slice = document.createElement('canvas');
      slice.width = canvas.width; slice.height = Math.round(H * k);
      const c = slice.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, slice.width, slice.height);
      c.drawImage(canvas, 0, -Math.round(n * H * k));
      if (n) pdf.addPage('letter', 'portrait');
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph);
    }
    const blob = pdf.output('blob');
    const base64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    return { base64, blob };
  } finally { f.remove(); }
}
