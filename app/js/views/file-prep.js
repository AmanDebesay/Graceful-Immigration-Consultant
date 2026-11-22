// Shrink scans and PDFs under a portal's size limit (IRCC PR portal, ATIP portal…), and combine photos into one PDF.
// Everything happens in this browser: files are never uploaded anywhere by this tool.
import { esc, icon, toast, fail } from '../core.js';
import { orgRules } from '../practice.js';
const orgRulesSafe = async () => (await orgRules().catch(() => ({}))).rules || {};

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const loaded = {};
const lib = (src, get) => loaded[src] || (loaded[src] = new Promise((ok, no) => {
  if (get()) return ok(get());
  const s = document.createElement('script'); s.src = src; s.onload = () => ok(get()); s.onerror = () => no(new Error('Could not load ' + src)); document.head.appendChild(s);
}));
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
const fileImg = (file) => new Promise((ok, no) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(`${file.name} is not a readable image.`)); i.src = u; });

function canvasOf(src, w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height); return c; }
const toBlob = (c, q) => new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));

// Pages: [{source (image or canvas), w, h (CSS px at 96 dpi or natural), ptW, ptH}]
async function buildPdf(pages, scale, quality) {
  const { jsPDF } = await lib(JSPDF, () => window.jspdf);
  let doc = null;
  for (const p of pages) {
    const c = canvasOf(p.source, p.w * scale, p.h * scale);
    const data = c.toDataURL('image/jpeg', quality);
    const o = p.ptW > p.ptH ? 'l' : 'p';
    if (!doc) doc = new jsPDF({ unit: 'pt', format: [p.ptW, p.ptH], orientation: o, compress: true });
    else doc.addPage([p.ptW, p.ptH], o);
    doc.addImage(data, 'JPEG', 0, 0, p.ptW, p.ptH, undefined, 'FAST');
  }
  return doc.output('blob');
}
const STEPS = [[1, 0.85], [1, 0.7], [0.85, 0.65], [0.7, 0.6], [0.6, 0.5], [0.5, 0.45], [0.42, 0.4], [0.35, 0.35]];

async function shrinkPages(pages, limit, progress) {
  let best = null;
  for (const [s, q] of STEPS) {
    progress(`Trying ${Math.round(s * 100)}% size, quality ${Math.round(q * 100)}…`);
    const b = await buildPdf(pages, s, q);
    best = b;
    if (b.size <= limit) return { blob: b, ok: true, step: [s, q] };
  }
  return { blob: best, ok: false };
}

async function pdfPages(file, progress) {
  const pdfjs = await lib(PDFJS, () => window.pdfjsLib);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    progress(`Reading page ${i} of ${pdf.numPages}…`);
    const page = await pdf.getPage(i), vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 2 });   // 144 dpi master
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    pages.push({ source: c, w: vp.width, h: vp.height, ptW: vp1.width, ptH: vp1.height });
  }
  return pages;
}
async function imagePages(files) {
  const pages = [];
  for (const f of files) {
    const img = await fileImg(f);
    const maxSide = 2200, k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    const ptW = 612, ptH = 612 * (h / w);   // Letter width
    pages.push({ source: img, w, h, ptW, ptH });
  }
  return pages;
}

export async function render(el) {
  const rules = await orgRulesSafe();
  const limits = [[rules.portal_mb ?? 4, 'IRCC PR portal / online application'], [rules.atip_mb ?? 2, 'ATIP online request'], [10, 'Email attachment'], [1, 'Small (1 MB)']];
  el.innerHTML = `<div class="alert info">Files are processed <b>in this browser only</b> — nothing is uploaded. Limits are set in Business Settings → Pricing &amp; rules (confirm current portal limits on the IRCC site). Scanned PDFs are rebuilt as images, so text is no longer selectable; keep the original in the client file.</div>
    <div class="card"><div class="card-b">
      <div class="row-2"><div class="field"><label>Size limit</label><select class="input" id="lim">${limits.map(([n, l]) => `<option value="${n}">${n} MB — ${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label>File name for the result</label><input class="input" id="nm" placeholder="e.g. 03. Biedu - Passport"></div></div>
      <div class="field"><label>Choose a PDF, or one or more photos / scans (JPG, PNG)</label><input class="input" type="file" id="in" accept="application/pdf,image/jpeg,image/png,image/webp" multiple></div>
      <label class="row" style="gap:8px;margin-bottom:12px"><input type="checkbox" id="one" checked> Combine several photos into one PDF (in the order chosen)</label>
      <button class="btn btn-primary" id="go">${icon('layers')} Make it fit</button> <span id="st" class="dk-muted" style="margin-left:8px"></span>
      <div id="out" style="margin-top:14px"></div></div></div>`;
  const st = el.querySelector('#st'), out = el.querySelector('#out');
  el.querySelector('#go').onclick = async (e) => {
    const files = [...el.querySelector('#in').files];
    if (!files.length) return fail(new Error('Choose a file first.'));
    const limit = Number(el.querySelector('#lim').value) * 1048576;
    const base = el.querySelector('#nm').value.trim() || files[0].name.replace(/\.[^.]+$/, '') + ' (reduced)';
    e.target.disabled = true; out.innerHTML = '';
    try {
      const pdfs = files.filter((f) => f.type === 'application/pdf'), imgs = files.filter((f) => f.type.startsWith('image/'));
      if (pdfs.length > 1 || (pdfs.length && imgs.length)) throw new Error('Choose one PDF, or photos only.');
      const results = [];
      if (pdfs.length) {
        if (pdfs[0].size <= limit) results.push({ name: base + '.pdf', blob: pdfs[0], ok: true, note: 'Already under the limit — no change needed.' });
        else { const r = await shrinkPages(await pdfPages(pdfs[0], (t) => (st.textContent = t)), limit, (t) => (st.textContent = t)); results.push({ name: base + '.pdf', blob: r.blob, ok: r.ok }); }
      } else if (el.querySelector('#one').checked) {
        const r = await shrinkPages(await imagePages(imgs), limit, (t) => (st.textContent = t)); results.push({ name: base + '.pdf', blob: r.blob, ok: r.ok });
      } else {
        for (const [i, f] of imgs.entries()) {
          const img = await fileImg(f); let ok = false, blob = null;
          for (const [s, q] of STEPS) { const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight)) * s; blob = await toBlob(canvasOf(img, img.naturalWidth * k, img.naturalHeight * k), q); if (blob.size <= limit) { ok = true; break; } }
          results.push({ name: `${base}${imgs.length > 1 ? ' ' + (i + 1) : ''}.jpg`, blob, ok });
        }
      }
      st.textContent = '';
      out.innerHTML = results.map((r, i) => `<div class="row" style="gap:10px;margin-bottom:8px"><span class="badge ${r.ok ? 'b-GREEN' : 'b-RED'}">${r.ok ? 'Fits' : 'Still too big'}</span>
        <b>${esc(r.name)}</b> · ${mb(r.blob.size)} <a class="btn btn-sm" data-dl="${i}">Download</a>${r.note ? ` <small class="dk-muted">${esc(r.note)}</small>` : ''}${r.ok ? '' : ' <small class="dk-muted">Split the document into parts (e.g. pages 1–10 and 11–20) and try again.</small>'}</div>`).join('');
      out.querySelectorAll('[data-dl]').forEach((a) => (a.onclick = () => { const r = results[+a.dataset.dl]; const u = URL.createObjectURL(r.blob); const l = document.createElement('a'); l.href = u; l.download = r.name; l.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); }));
      toast('Done');
    } catch (err) { st.textContent = ''; fail(err); }
    e.target.disabled = false;
  };
}
