// Shared lists for the Call Log and the Marketing page.
export const SOURCES = [
  ['unknown', 'Not asked yet'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['youtube', 'YouTube'],
  ['whatsapp', 'WhatsApp (shared message)'], ['google', 'Google search'], ['website', 'Website'], ['referral', 'Friend / referral'],
  ['community', 'Community / church / event'], ['returning', 'Existing client'], ['other', 'Other'],
];
export const SOURCE_LABEL = Object.fromEntries(SOURCES);

export const CATEGORIES = [
  ['unreviewed', 'To review', ''], ['just_asking', 'Just asking', 'b-blue'], ['potential', 'Potential client', 'b-gold'],
  ['booked', 'Booked consultation', 'b-navy'], ['paying', 'Paying client', 'b-GREEN'], ['existing_client', 'Existing client', 'b-navy'],
  ['spam', 'Spam', 'b-RED'], ['wrong_number', 'Wrong number', ''], ['personal', 'Personal', ''],
];
export const CAT_LABEL = Object.fromEntries(CATEGORIES.map(([k, l]) => [k, l]));
export const CAT_CLS = Object.fromEntries(CATEGORIES.map(([k, , c]) => [k, c]));
export const NOT_LEADS = ['spam', 'wrong_number', 'personal'];

export const CHANNELS = [['phone', 'Phone'], ['whatsapp', 'WhatsApp'], ['teams', 'Teams'], ['messenger', 'Messenger'], ['other', 'Other']];
export const STATUSES = [['answered', 'Answered'], ['missed', 'Missed'], ['voicemail', 'Voicemail'], ['outgoing', 'We called them'], ['ringing', 'Ringing']];

/** Last 10 digits, to match the same person across calls. */
export const phoneKey = (n) => String(n || '').replace(/\D/g, '').slice(-10);
export const fmtPhone = (n) => {
  const s = String(n || ''), d = s.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10 && !s.startsWith('+')) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return s;
};
export const AB_TZ = 'America/Edmonton';
export const abDate = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: AB_TZ });
