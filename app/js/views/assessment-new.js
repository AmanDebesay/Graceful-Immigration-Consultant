// New intake: two ways to take it. The quick form (the same form as the website) or a full pathway assessment.
import { can, icon, fail } from '../core.js';

export async function render(el) {
  el.innerHTML = `
    <div class="toolbar"><a class="btn btn-sm" href="#/assessments">← All assessments</a><div class="grow"></div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px;max-width:980px">
      <div class="card"><div class="card-b">
        <h3 style="font-family:var(--serif);color:var(--navy);font-size:20px;margin-bottom:6px">${icon('clipboard')} Quick intake form</h3>
        <p class="dk-muted" style="margin-bottom:14px">The same short form as the website. Good for a first call: contact details, what they need, priority (red, amber, green).</p>
        <button class="btn btn-primary" id="quick">Start quick form</button></div></div>
      ${can('pathway.edit') ? `<div class="card"><div class="card-b">
        <h3 style="font-family:var(--serif);color:var(--navy);font-size:20px;margin-bottom:6px">${icon('route')} Pathway assessment</h3>
        <p class="dk-muted" style="margin-bottom:14px">The full intake. Every immigration route is checked against the client's answers, and a short summary of the recommended option and why is drafted for you.</p>
        <button class="btn btn-gold" id="path">Start pathway assessment</button></div></div>` : ''}
    </div>`;
  el.querySelector('#quick').onclick = () => quickForm(el);
  el.querySelector('#path')?.addEventListener('click', async () => {
    const { startPathway } = await import('./pathways.js');
    startPathway({ newClient: true }).catch(fail);
  });
}

// Staff fill in the website form during a call; it opens embedded and submits with their login.
function quickForm(el) {
  el.innerHTML = `
    <div class="toolbar"><a class="btn btn-sm" href="#/assessments">← All assessments</a>
      <span style="color:var(--muted)">Fill this in while speaking with the client. It's filed under their contact automatically.</span></div>
    <div class="card" style="overflow:hidden"><iframe id="af" src="../public/assessment.html?staff=1&embed=1" title="Assessment form"
      style="width:100%;height:80vh;border:0;display:block"></iframe></div>`;
  const onMsg = (e) => {
    if (e.origin !== location.origin || e.data?.type !== 'gi-assessment-saved') return;
    window.removeEventListener('message', onMsg);
    window.dispatchEvent(new Event('refresh-counts'));
    location.hash = e.data.id ? `#/assessments/${e.data.id}` : '#/assessments';
  };
  window.addEventListener('message', onMsg);
}
