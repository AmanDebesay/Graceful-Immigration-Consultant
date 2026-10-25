// AI Assistant (Claude) for staff: practice questions and assessment reviews.
// The conversation lives only in this browser tab (sessionStorage); the server stores token counts only.
import { db, can, esc, icon, fmtDate, triageBadge, FN_URL, SUPABASE_KEY } from '../core.js';

const KEY = 'gi_ai_chat';
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || { messages: [], assessment: null }; } catch { return { messages: [], assessment: null }; } };
const save = (c) => { try { sessionStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable */ } };

/** Minimal, safe Markdown → HTML (escape first, then add formatting). */
export function md(text) {
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  const out = []; let list = null;
  for (const raw of esc(text).split('\n')) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { const type = /^\s*\d/.test(line) ? 'ol' : 'ul'; if (list !== type) { if (list) out.push(`</${list}>`); out.push(`<${type}>`); list = type; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push(`</${list}>`); list = null; }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) out.push(`<h4>${inline(h[1])}</h4>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('');
}

/** Streams a reply from an AI function, calling onText with the text so far. */
export async function streamFn(name, payload, onText, auth = true) {
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  if (auth) { const { data: { session } } = await db.auth.getSession(); headers.Authorization = `Bearer ${session?.access_token}`; }
  const res = await fetch(`${FN_URL}/${name}`, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok || !res.body) {
    const t = await res.text(); let msg = t;
    try { msg = JSON.parse(t).error || t; } catch { /* plain text */ }
    throw new Error(msg || 'The assistant could not answer.');
  }
  const reader = res.body.getReader(), dec = new TextDecoder(); let text = '';
  for (;;) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); onText(text); }
  return text;
}

const SUGGEST = [
  ['Review the attached assessment', 'Review this assessment: likely pathways, eligibility issues, red flags, missing information, documents to request and questions for the consultation.'],
  ['Spousal sponsorship checklist', 'Give me a document checklist for an outland spousal sponsorship, with notes on common refusal reasons.'],
  ['RAD appeal deadlines', 'Explain the deadlines and steps for a Refugee Appeal Division appeal after a negative RPD decision.'],
  ['Draft a client email', 'Draft a short, friendly email asking a client to send their missing documents, with a placeholder list.'],
];

export async function render(el) {
  const chat = load();
  const preset = new URLSearchParams(location.hash.split('?')[1] || '').get('a');
  if (preset && chat.assessment?.id !== preset) { chat.assessment = { id: preset }; chat.messages = []; }
  if (chat.assessment && !chat.assessment.label) {
    const { data } = await db.from('intake_submissions').select('id, created_at, triage_level, contacts(full_name)').eq('id', chat.assessment.id).maybeSingle();
    chat.assessment = data ? { id: data.id, label: `${data.contacts?.full_name || 'Client'} · ${fmtDate(data.created_at)}`, level: data.triage_level } : null;
  }
  save(chat);

  el.innerHTML = `<div class="ai-wrap">
    <div class="ai-main dk-card">
      <div class="ai-head"><div class="ai-badge">${icon('sparkle')}</div><div><h3>Graceful AI Assistant</h3><small>Powered by Claude · answers are a starting point; you make the final call</small></div>
        <div class="grow"></div><button class="btn btn-sm" id="newChat">${icon('plus')} New chat</button></div>
      <div class="ai-ctx" id="ctx"></div>
      <div class="ai-log" id="log"></div>
      <form class="ai-form" id="f"><textarea class="input" id="q" rows="2" placeholder="Ask about a case, a program, IRPA/IRPR, or ask for a draft…"></textarea>
        <button class="btn btn-gold" id="send" type="submit">${icon('arrowr')}</button></form>
      <p class="ai-note">Assessments are sent without the client's name and contact details. Please don't paste passport or UCI numbers. Processed by Anthropic; not used to train AI models.</p>
    </div>
    <aside class="ai-side">
      ${can('intake.view') ? `<div class="dk-card"><div class="dk-h"><h3>Attach an assessment</h3></div><div id="alist" class="dk-muted">Loading…</div></div>` : ''}
      <div class="dk-card"><div class="dk-h"><h3>Try asking</h3></div><div class="ai-sugg">${SUGGEST.map(([l, q], i) => `<button data-s="${i}">${esc(l)}</button>`).join('')}</div></div>
      ${can('settings.manage') ? `<a class="dk-card ai-setlink" href="#/settings?tab=ai">${icon('settings')}<span><b>Teach the assistant</b><small>Add your own instructions and knowledge</small></span></a>` : ''}
    </aside></div>`;

  const log = el.querySelector('#log'), q = el.querySelector('#q'), send = el.querySelector('#send');
  const bubble = (m) => `<div class="ai-msg ${m.role}">${m.role === 'assistant' ? `<span class="ai-av">${icon('sparkle')}</span>` : ''}<div class="ai-bub">${m.role === 'assistant' ? md(m.content) : esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
  const draw = () => {
    log.innerHTML = chat.messages.length ? chat.messages.map(bubble).join('')
      : `<div class="ai-empty">${icon('sparkle')}<h3>How can I help today?</h3><p>Ask a question, or attach an assessment on the right and ask for a review.</p></div>`;
    log.scrollTop = log.scrollHeight;
  };
  const drawCtx = () => {
    el.querySelector('#ctx').innerHTML = chat.assessment
      ? `<span>${icon('clipboard')} Assessment attached: <b>${esc(chat.assessment.label)}</b> ${triageBadge(chat.assessment.level)}</span><button class="btn btn-sm btn-ghost" id="detach">${icon('x')} Remove</button>` : '';
    el.querySelector('#detach')?.addEventListener('click', () => { chat.assessment = null; save(chat); drawCtx(); });
  };
  draw(); drawCtx();

  if (can('intake.view')) {
    const { data } = await db.from('intake_submissions').select('id, created_at, triage_level, contacts(full_name)').order('created_at', { ascending: false }).limit(8);
    const box = el.querySelector('#alist');
    box.innerHTML = (data || []).length ? `<div class="dk-list">${data.map((a) => `<button class="ai-att" data-id="${a.id}">${triageBadge(a.triage_level)}<span>${esc(a.contacts?.full_name || 'Client')}<small>${fmtDate(a.created_at)}</small></span></button>`).join('')}</div>` : 'No assessments yet.';
    box.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => {
      const a = data.find((x) => x.id === b.dataset.id);
      chat.assessment = { id: a.id, label: `${a.contacts?.full_name || 'Client'} · ${fmtDate(a.created_at)}`, level: a.triage_level }; save(chat); drawCtx();
    }));
  }

  const ask = async (text) => {
    if (!text.trim() || send.disabled) return;
    chat.messages.push({ role: 'user', content: text.trim() });
    const reply = { role: 'assistant', content: '' }; chat.messages.push(reply);
    draw(); q.value = ''; send.disabled = true;
    const last = () => log.querySelector('.ai-msg.assistant:last-child .ai-bub');
    last().innerHTML = '<span class="ai-typing"><i></i><i></i><i></i></span>';
    try {
      await streamFn('ai-assist', { messages: chat.messages.slice(0, -1), assessment_id: chat.assessment?.id || undefined }, (t) => {
        reply.content = t; if (!el.isConnected) return;
        last().innerHTML = md(t); log.scrollTop = log.scrollHeight;
      });
    } catch (err) {
      reply.content = `⚠️ ${err.message}`;
    } finally {
      if (!reply.content.trim()) reply.content = '⚠️ No answer came back. Please try again.';
      save(chat); send.disabled = false; if (el.isConnected) { draw(); q.focus(); }
    }
  };
  el.querySelector('#f').onsubmit = (e) => { e.preventDefault(); ask(q.value); };
  q.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q.value); } };
  el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => ask(SUGGEST[+b.dataset.s][1])));
  el.querySelector('#newChat').onclick = () => { chat.messages = []; chat.assessment = null; save(chat); draw(); drawCtx(); };
  if (preset && !chat.messages.length) ask(SUGGEST[0][1]);
  else q.focus();
}
