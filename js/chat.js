/* chat.js — Team Chat with AI assistant powered by Claude */
const CHAT_STATE = {
  channel: 'general',
  messages: {
    general: [
      { id:1, author:'Assistant', avatar:'AS', text:'Good morning team! Tesfaye\'s passport copy still missing — deadline Apr 9. Can someone follow up?', time:'9:15 AM', self:false },
      { id:2, author:'You', avatar:'RC', text:'On it. I\'ll send a reminder message to the client today.', time:'9:32 AM', self:true }
    ],
    'case-001': [
      { id:1, author:'Assistant', avatar:'AS', text:'VIS-2026-AB-WB-001 update: 7 of 10 documents received. Missing: passport, marriage cert translation, relationship photos.', time:'Yesterday', self:false }
    ],
    'case-002': [
      { id:1, author:'You', avatar:'RC', text:'Maria\'s LMIA confirmed. Starting IMM 1295 today.', time:'Apr 2', self:false }
    ]
  },
  aiTyping: false
};

const CHANNELS = [
  { id:'general', label:'# general', icon:'#' },
  { id:'case-001', label:'# VIS-2026-AB-WB-001', icon:'#' },
  { id:'case-002', label:'# VIS-2026-AB-PH-002', icon:'#' },
  { id:'case-003', label:'# VIS-2026-AB-RC-003', icon:'#' }
];
const DMS = [
  { id:'dm-assistant', label:'Assistant', avatar:'AS' },
  { id:'dm-partner', label:'Partner RCIC (BC)', avatar:'PR' }
];

document.addEventListener('DOMContentLoaded', buildChatUI);

function buildChatUI() {
  const chanEl = document.getElementById('chatChannels');
  const dmEl = document.getElementById('chatDMs');
  if (!chanEl || !dmEl) return;

  chanEl.innerHTML = CHANNELS.map(c =>
    `<div class="chat-channel-item ${c.id===CHAT_STATE.channel?'active':''}" id="chan-${c.id}" onclick="switchChannel('${c.id}')">
      <span style="font-size:13px;color:var(--gold)">${c.icon}</span>
      <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.label}</span>
    </div>`).join('');

  dmEl.innerHTML = DMS.map(d =>
    `<div class="chat-channel-item" id="chan-${d.id}" onclick="switchChannel('${d.id}')">
      <div style="width:22px;height:22px;border-radius:50%;background:var(--navy);color:white;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${d.avatar}</div>
      <span style="font-size:12px">${d.label}</span>
    </div>`).join('');

  // Init messages for DMs
  if (!CHAT_STATE.messages['dm-assistant']) CHAT_STATE.messages['dm-assistant'] = [];
  if (!CHAT_STATE.messages['dm-partner']) CHAT_STATE.messages['dm-partner'] = [];

  renderMessages();
}

function switchChannel(id) {
  CHAT_STATE.channel = id;
  document.querySelectorAll('.chat-channel-item').forEach(el => el.classList.remove('active'));
  document.getElementById('chan-'+id)?.classList.add('active');
  const chan = CHANNELS.find(c=>c.id===id);
  const dm = DMS.find(d=>d.id===id);
  const header = document.getElementById('chatHeader');
  if (header) header.innerHTML = `<span>${chan?.label || dm?.label || id}</span><span class="badge badge-green">● Active</span>`;
  renderMessages();
}

function renderMessages() {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const list = CHAT_STATE.messages[CHAT_STATE.channel] || [];
  msgs.innerHTML = list.map(m => `
    <div class="chat-msg ${m.self?'self':''}">
      <div class="msg-avatar ${m.ai?'ai':''}">${m.avatar}</div>
      <div class="msg-body">
        <div class="msg-name">${m.author}</div>
        <div class="msg-bubble ${m.ai?'ai':''}">${m.text}</div>
        <div class="msg-time">${m.time}</div>
      </div>
    </div>`).join('');
  msgs.scrollTop = msgs.scrollHeight;
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  const now = new Date().toLocaleTimeString('en-CA', {hour:'2-digit',minute:'2-digit'});
  if (!CHAT_STATE.messages[CHAT_STATE.channel]) CHAT_STATE.messages[CHAT_STATE.channel] = [];
  CHAT_STATE.messages[CHAT_STATE.channel].push({ id: Date.now(), author:'You', avatar:'RC', text, time: now, self:true });
  renderMessages();
  // Update notes badge
  const badge = document.getElementById('chatBadge');
  if (badge) badge.textContent = '●';
}

async function askAI() {
  const input = document.getElementById('chatInput');
  const text = input?.value?.trim() || 'What is the current spousal sponsorship processing time from IRCC?';
  input.value = '';
  const now = new Date().toLocaleTimeString('en-CA', {hour:'2-digit',minute:'2-digit'});
  if (!CHAT_STATE.messages[CHAT_STATE.channel]) CHAT_STATE.messages[CHAT_STATE.channel] = [];

  // Add user message
  CHAT_STATE.messages[CHAT_STATE.channel].push({ id: Date.now(), author:'You', avatar:'RC', text, time: now, self:true });

  // Add typing indicator
  CHAT_STATE.messages[CHAT_STATE.channel].push({ id: 'typing', author:'Graceful AI', avatar:'AI', text:'Thinking...', time: now, ai:true, self:false });
  renderMessages();

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are the Graceful Immigration Consultant Inc. AI assistant for the team chat. 
You help the RCIC team with Canadian immigration questions, IRCC processes, form requirements, processing times, and practice management.
You are concise and practical — give direct answers with action items.
You know about the IRCC spousal sponsorship process and all major Canadian immigration pathways.
You serve clients across Canada from a team of RCICs in multiple provinces.
Keep responses under 150 words. Use bullet points when listing multiple items.`,
        messages: [{ role: 'user', content: text }]
      })
    });
    const data = await res.json();
    const reply = data.content?.[0]?.text || 'Sorry, I had trouble with that. Please check the IRCC website.';
    CHAT_STATE.messages[CHAT_STATE.channel] = CHAT_STATE.messages[CHAT_STATE.channel].filter(m => m.id !== 'typing');
    CHAT_STATE.messages[CHAT_STATE.channel].push({ id: Date.now(), author:'Graceful AI', avatar:'AI', text: reply, time: now, ai:true, self:false });
  } catch(err) {
    CHAT_STATE.messages[CHAT_STATE.channel] = CHAT_STATE.messages[CHAT_STATE.channel].filter(m => m.id !== 'typing');
    CHAT_STATE.messages[CHAT_STATE.channel].push({ id: Date.now(), author:'Graceful AI', avatar:'AI', text:'Connection error. Please try again.', time: now, ai:true, self:false });
  }
  renderMessages();
}
