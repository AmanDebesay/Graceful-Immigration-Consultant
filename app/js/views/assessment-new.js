// Staff fill in the same assessment form during a call; it opens embedded and submits with their login.
export async function render(el) {
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
