// Flagged people: a folder of people to watch for. Wherever a name, phone number or email is typed or shown
// (global search, Call Log, Log a call, contact pages), a match shows a red flag with the reason.
import { db, can, esc, icon, modal, toast } from './core.js';

export const REASONS = [
  ['disappeared', 'Booked / consulted, then disappeared'], ['no_show', 'Did not show up'], ['not_paid', 'Did not pay'],
  ['follow_up', 'Follow up later'], ['do_not_serve', 'Do not take as a client'], ['other', 'Other'],
];
export const REASON_LABEL = Object.fromEntries(REASONS);

let cache = null, cachedAt = 0;
export async function loadFlags(force = false) {
  if (!can('crm.view')) return [];
  if (!force && cache && Date.now() - cachedAt < 120000) return cache;
  const { data } = await db.from('flags').select('*').eq('active', true).order('created_at', { ascending: false }).limit(2000);
  cache = data || []; cachedAt = Date.now();
  return cache;
}
export const invalidateFlags = () => { cache = null; };

const digits = (s) => String(s || '').replace(/\D/g, '');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const e164 = (s) => { const t = String(s || '').trim(), d = digits(t); if (!d) return ''; if (t.startsWith('+')) return '+' + d; if (t.startsWith('00')) return '+' + d.slice(2); if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return '+' + d; };

/** Flags that match what was typed or shown. `text` matches name, phone or email loosely (search boxes);
    name/phone/email match one field (forms and lists). */
export function matchFlags(flags, { name, phone, email, text } = {}) {
  const out = [];
  const pd = digits(phone), td = digits(text), tn = norm(text), nn = norm(name), em = String(email || '').trim().toLowerCase();
  for (const f of flags || []) {
    const fn = norm(f.name), fp = (f.phones || []).map(digits).filter(Boolean), fe = (f.emails || []).map((x) => x.toLowerCase());
    const phoneHit = (d, loose) => d.length >= 7 && fp.some((x) => x.slice(-10) === d.slice(-10) || (loose && d.length >= 6 && x.includes(d)));
    const nameHit = (n, loose) => n.length >= 3 && fn && (fn === n || (loose ? fn.includes(n) : false) || (fn.split(' ').length > 1 && fn.split(' ').every((w) => n.split(' ').includes(w))));
    const hit = (pd && phoneHit(pd, false)) || (em && fe.includes(em)) || (nn && nameHit(nn, false))
      || (text && ((td.length >= 6 && phoneHit(td, true)) || (tn.length >= 3 && (nameHit(tn, true) || fe.some((x) => tn.length >= 4 && x.includes(tn))))));
    if (hit) out.push(f);
  }
  return out;
}

export const flagBadge = (list) => list?.length ? `<span class="badge b-RED" title="${esc(list.map((f) => `${f.name}: ${REASON_LABEL[f.reason]}${f.notes ? ' — ' + f.notes : ''}`).join('\n'))}">⚑ Flagged</span>` : '';
export const flagBanner = (list) => list?.length ? `<div class="alert err" style="margin-bottom:12px"><b>⚑ Flagged:</b> ${list.map((f) =>
  `<b>${esc(f.name)}</b> · ${esc(REASON_LABEL[f.reason])}${f.notes ? ` · ${esc(f.notes.slice(0, 160))}` : ''}`).join('<br>')} &nbsp;<a href="#/flags">Open Flagged</a></div>` : '';

/** Add or edit a flag. prefill: { name, phones:[], emails:[], contact_id, notes } */
export function flagPerson(f = {}, after) {
  if (!can('crm.edit')) return toast('You do not have permission to flag people.');
  modal({
    title: f.id ? `Flag: ${f.name}` : '⚑ Flag this person',
    body: `<div class="field"><label>Name</label><input class="input" id="fn" value="${esc(f.name || '')}"></div>
      <div class="row-2"><div class="field"><label>Phone numbers (one per line)</label><textarea class="input" id="fp" rows="2">${esc((f.phones || []).join('\n'))}</textarea></div>
        <div class="field"><label>Emails (one per line)</label><textarea class="input" id="fe" rows="2">${esc((f.emails || []).join('\n'))}</textarea></div></div>
      <div class="row-2"><div class="field"><label>Why</label><select class="input" id="fr">${REASONS.map(([k, l]) => `<option value="${k}" ${f.reason === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label>Remind me on (optional)</label><input class="input" id="fd" type="date" value="${esc(f.remind_on || '')}"></div></div>
      <div class="field"><label>Notes</label><textarea class="input" id="fx" rows="3" placeholder="e.g. Had a 1-hour consultation Nov 27 about a spousal sponsorship, said they would sign and never answered again.">${esc(f.notes || '')}</textarea></div>
      ${f.id ? `<label class="row" style="gap:8px"><input type="checkbox" id="fa" ${f.active !== false ? 'checked' : ''}> Active (uncheck to stop flagging them)</label>` : ''}`,
    actions: [
      ...(f.id ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => { const { error } = await db.from('flags').delete().eq('id', f.id); if (error) throw error; invalidateFlags(); toast('Flag deleted'); after?.(); } }] : []),
      { label: 'Cancel' }, { label: f.id ? 'Save' : 'Flag', cls: 'btn-primary', onClick: async (m) => {
        const v = (q) => m.querySelector(q).value.trim(), list = (q) => v(q).split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
        const row = { name: v('#fn'), phones: [...new Set(list('#fp').map(e164).filter(Boolean))], emails: [...new Set(list('#fe').map((x) => x.toLowerCase()))],
          reason: v('#fr'), remind_on: v('#fd') || null, notes: v('#fx') || null, contact_id: f.contact_id || null };
        if (m.querySelector('#fa')) row.active = m.querySelector('#fa').checked;
        if (!row.name && !row.phones.length && !row.emails.length) throw new Error('Enter a name, phone or email.');
        if (!row.name) row.name = row.phones[0] || row.emails[0];
        const { error } = f.id ? await db.from('flags').update(row).eq('id', f.id) : await db.from('flags').insert(row);
        if (error) throw error;
        invalidateFlags(); toast(f.id ? 'Flag saved' : 'Flagged. You will see it whenever they come up.'); after?.();
      } }],
  });
}
