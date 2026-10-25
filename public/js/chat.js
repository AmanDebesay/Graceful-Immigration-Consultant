/* Website chat assistant (Claude): services, fees and booking. No immigration advice.
   Conversation is kept only in this browser tab. */
(function () {
  if (window.__giChat || document.documentElement.classList.contains('embed')) return;
  window.__giChat = 1;
  var FN = 'https://bmzhcprthrocbqluxpwa.supabase.co/functions/v1/public-chat';
  var KEY = 'sb_publishable_ZcaXkELPK820lTD41ffw2Q_iMTta3uT';
  var STORE = 'gi_public_chat';
  var SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>';
  var CHIPS = ['What services do you offer?', 'How do I book a consultation?', 'How much does a consultation cost?', 'Do you speak Tigrinya, Amharic or Arabic?'];

  var msgs = [];
  try { msgs = JSON.parse(sessionStorage.getItem(STORE)) || []; } catch (e) { msgs = []; }
  var save = function () { try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-16))); } catch (e) { /* ignore */ } };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var md = function (t) {
    var out = [], list = false;
    esc(t).split('\n').forEach(function (line) {
      var inl = function (s) {
        return s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
          .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
          .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
          .replace(/(\(?\d{3}\)?[\s-]\d{3}-\d{4})/g, function (m) { return '<a href="tel:+1' + m.replace(/\D/g, '') + '">' + m + '</a>'; });
      };
      var li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (li) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inl(li[1]) + '</li>'); return; }
      if (list) { out.push('</ul>'); list = false; }
      if (line.trim()) out.push('<p>' + inl(line.replace(/^#+\s*/, '')) + '</p>');
    });
    if (list) out.push('</ul>');
    return out.join('');
  };

  var root = document.createElement('div');
  root.className = 'gi-chat notranslate'; root.setAttribute('translate', 'no');
  root.innerHTML =
    '<button class="gc-launch" type="button" aria-label="Open chat assistant">' + SPARK + '<span>Ask our assistant</span></button>' +
    '<section class="gc-panel" role="dialog" aria-label="Graceful assistant" hidden>' +
      '<header><span class="gc-av">' + SPARK + '</span><div><b>Graceful Assistant</b><small>AI assistant · usually answers instantly</small></div>' +
      '<button class="gc-x" type="button" aria-label="Close chat">&times;</button></header>' +
      '<div class="gc-log" aria-live="polite"></div>' +
      '<div class="gc-chips"></div>' +
      '<form class="gc-form"><input type="text" maxlength="1000" placeholder="Type your question…" aria-label="Your message"><button type="submit" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/></svg></button></form>' +
      '<p class="gc-note">I\'m an AI assistant: I can help with our services and booking, not immigration advice. Please don\'t share passport numbers or other personal details here.</p>' +
    '</section>';
  document.body.appendChild(root);
  document.documentElement.classList.add('has-gi-chat');

  var panel = root.querySelector('.gc-panel'), log = root.querySelector('.gc-log'), chips = root.querySelector('.gc-chips');
  var form = root.querySelector('.gc-form'), input = form.querySelector('input'), sendBtn = form.querySelector('button');
  var busy = false;

  function bubble(m) { return '<div class="gc-m ' + m.role + '">' + (m.role === 'assistant' ? md(m.content) : esc(m.content)) + '</div>'; }
  function draw() {
    log.innerHTML = '<div class="gc-m assistant"><p>Hello! 👋 I\'m the Graceful Immigration assistant. I can tell you about our services, consultation fees and how to book. You can write in English, ትግርኛ, አማርኛ or العربية.</p></div>' + msgs.map(bubble).join('');
    chips.innerHTML = msgs.length ? '' : CHIPS.map(function (c) { return '<button type="button">' + esc(c) + '</button>'; }).join('');
    log.scrollTop = log.scrollHeight;
  }
  function open(v) {
    panel.hidden = !v; root.classList.toggle('open', v);
    if (v) { draw(); setTimeout(function () { input.focus(); }, 50); }
  }
  root.querySelector('.gc-launch').onclick = function () { open(panel.hidden); };
  root.querySelector('.gc-x').onclick = function () { open(false); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) open(false); });
  chips.onclick = function (e) { var b = e.target.closest('button'); if (b) ask(b.textContent); };
  form.onsubmit = function (e) { e.preventDefault(); ask(input.value); };

  function ask(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true; input.value = '';
    msgs.push({ role: 'user', content: text });
    var reply = { role: 'assistant', content: '' }; msgs.push(reply);
    draw();
    var last = log.lastElementChild;
    last.innerHTML = '<span class="gc-typing"><i></i><i></i><i></i></span>';
    fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY },
      body: JSON.stringify({ messages: msgs.slice(0, -1) }) })
      .then(function (res) {
        if (!res.ok || !res.body) return res.text().then(function (t) { var m = t; try { m = JSON.parse(t).error || t; } catch (e) { /* text */ } throw new Error(m); });
        var reader = res.body.getReader(), dec = new TextDecoder();
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return;
            reply.content += dec.decode(r.value, { stream: true });
            last.innerHTML = md(reply.content); log.scrollTop = log.scrollHeight;
            return pump();
          });
        }
        return pump();
      })
      .catch(function (err) {
        reply.content = (err && err.message && err.message.length < 300 ? err.message : 'Sorry, I could not answer just now.') + '\n\nYou can call us at (403) 915-4230 or book online: https://gracefulimmigration.ca/public/book.html';
      })
      .then(function () {
        if (!reply.content.trim()) reply.content = 'Sorry, I could not answer just now. Please call (403) 915-4230.';
        save(); draw(); busy = false; sendBtn.disabled = false; input.focus();
      });
  }
})();
