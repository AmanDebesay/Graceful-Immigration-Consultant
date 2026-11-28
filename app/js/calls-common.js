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

// ── Country a phone number belongs to (from its country code; +1 numbers by area code) ──
const CA_AREAS = new Set('204 226 236 249 250 257 263 289 306 343 354 365 367 368 382 387 403 416 418 428 431 437 438 450 460 468 474 506 514 519 548 579 581 584 587 600 604 613 622 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905 942'.split(' '));
const NANP_OTHER = { 242: 'Bahamas', 246: 'Barbados', 264: 'Anguilla', 268: 'Antigua and Barbuda', 284: 'British Virgin Islands', 340: 'US Virgin Islands', 345: 'Cayman Islands',
  441: 'Bermuda', 473: 'Grenada', 649: 'Turks and Caicos', 658: 'Jamaica', 876: 'Jamaica', 664: 'Montserrat', 670: 'Northern Mariana Islands', 671: 'Guam', 684: 'American Samoa',
  721: 'Sint Maarten', 758: 'Saint Lucia', 767: 'Dominica', 784: 'Saint Vincent', 787: 'Puerto Rico', 939: 'Puerto Rico', 809: 'Dominican Republic', 829: 'Dominican Republic',
  849: 'Dominican Republic', 868: 'Trinidad and Tobago', 869: 'Saint Kitts and Nevis' };
const CC = {
  7: 'Russia / Kazakhstan', 20: 'Egypt', 27: 'South Africa', 30: 'Greece', 31: 'Netherlands', 32: 'Belgium', 33: 'France', 34: 'Spain', 36: 'Hungary', 39: 'Italy', 40: 'Romania',
  41: 'Switzerland', 43: 'Austria', 44: 'United Kingdom', 45: 'Denmark', 46: 'Sweden', 47: 'Norway', 48: 'Poland', 49: 'Germany', 51: 'Peru', 52: 'Mexico', 53: 'Cuba',
  54: 'Argentina', 55: 'Brazil', 56: 'Chile', 57: 'Colombia', 58: 'Venezuela', 60: 'Malaysia', 61: 'Australia', 62: 'Indonesia', 63: 'Philippines', 64: 'New Zealand',
  65: 'Singapore', 66: 'Thailand', 81: 'Japan', 82: 'South Korea', 84: 'Vietnam', 86: 'China', 90: 'Turkey', 91: 'India', 92: 'Pakistan', 93: 'Afghanistan', 94: 'Sri Lanka',
  95: 'Myanmar', 98: 'Iran', 211: 'South Sudan', 212: 'Morocco', 213: 'Algeria', 216: 'Tunisia', 218: 'Libya', 220: 'Gambia', 221: 'Senegal', 222: 'Mauritania', 223: 'Mali',
  224: 'Guinea', 225: "Côte d'Ivoire", 226: 'Burkina Faso', 227: 'Niger', 228: 'Togo', 229: 'Benin', 230: 'Mauritius', 231: 'Liberia', 232: 'Sierra Leone', 233: 'Ghana',
  234: 'Nigeria', 235: 'Chad', 236: 'Central African Republic', 237: 'Cameroon', 238: 'Cape Verde', 239: 'São Tomé and Príncipe', 240: 'Equatorial Guinea', 241: 'Gabon',
  242: 'Congo', 243: 'DR Congo', 244: 'Angola', 245: 'Guinea-Bissau', 248: 'Seychelles', 249: 'Sudan', 250: 'Rwanda', 251: 'Ethiopia', 252: 'Somalia', 253: 'Djibouti',
  254: 'Kenya', 255: 'Tanzania', 256: 'Uganda', 257: 'Burundi', 258: 'Mozambique', 260: 'Zambia', 261: 'Madagascar', 262: 'Réunion / Mayotte', 263: 'Zimbabwe', 264: 'Namibia',
  265: 'Malawi', 266: 'Lesotho', 267: 'Botswana', 268: 'Eswatini', 269: 'Comoros', 290: 'Saint Helena', 291: 'Eritrea', 297: 'Aruba', 298: 'Faroe Islands', 299: 'Greenland',
  350: 'Gibraltar', 351: 'Portugal', 352: 'Luxembourg', 353: 'Ireland', 354: 'Iceland', 355: 'Albania', 356: 'Malta', 357: 'Cyprus', 358: 'Finland', 359: 'Bulgaria',
  370: 'Lithuania', 371: 'Latvia', 372: 'Estonia', 373: 'Moldova', 374: 'Armenia', 375: 'Belarus', 376: 'Andorra', 377: 'Monaco', 378: 'San Marino', 380: 'Ukraine',
  381: 'Serbia', 382: 'Montenegro', 383: 'Kosovo', 385: 'Croatia', 386: 'Slovenia', 387: 'Bosnia and Herzegovina', 389: 'North Macedonia', 420: 'Czechia', 421: 'Slovakia',
  423: 'Liechtenstein', 501: 'Belize', 502: 'Guatemala', 503: 'El Salvador', 504: 'Honduras', 505: 'Nicaragua', 506: 'Costa Rica', 507: 'Panama', 509: 'Haiti',
  591: 'Bolivia', 592: 'Guyana', 593: 'Ecuador', 595: 'Paraguay', 597: 'Suriname', 598: 'Uruguay', 670: 'Timor-Leste', 673: 'Brunei', 675: 'Papua New Guinea', 679: 'Fiji',
  852: 'Hong Kong', 853: 'Macau', 855: 'Cambodia', 856: 'Laos', 880: 'Bangladesh', 886: 'Taiwan', 960: 'Maldives', 961: 'Lebanon', 962: 'Jordan', 963: 'Syria', 964: 'Iraq',
  965: 'Kuwait', 966: 'Saudi Arabia', 967: 'Yemen', 968: 'Oman', 970: 'Palestine', 971: 'United Arab Emirates', 972: 'Israel', 973: 'Bahrain', 974: 'Qatar', 975: 'Bhutan',
  976: 'Mongolia', 977: 'Nepal', 992: 'Tajikistan', 993: 'Turkmenistan', 994: 'Azerbaijan', 995: 'Georgia', 996: 'Kyrgyzstan', 998: 'Uzbekistan',
};
/** Country name for a phone number, or 'Unknown'. Numbers typed without + and with 10 digits are taken as Canada/US. */
export function countryOf(n) {
  let s = String(n || '').trim(), d = s.replace(/\D/g, '');
  if (!d) return 'Unknown';
  if (s.startsWith('00')) { d = d.slice(2); s = '+' + d; }
  if (!s.startsWith('+') && d.length === 10) d = '1' + d;
  if (!s.startsWith('+') && !(d.length === 11 && d[0] === '1')) return 'Unknown';
  if (d[0] === '1') { const a = d.slice(1, 4); return CA_AREAS.has(a) ? 'Canada' : NANP_OTHER[a] || 'United States'; }
  for (const len of [3, 2, 1]) { const c = CC[d.slice(0, len)]; if (c) return c; }
  return 'Unknown';
}
/** The caller's number for a call (ours dialled out, theirs called in). */
export const otherParty = (c) => (c.direction === 'outbound' ? c.to_number || c.from_number : c.from_number) || '';
