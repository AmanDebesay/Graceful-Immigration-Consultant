# Graceful Immigration Consultant Portal v2
**Complete Practice Management System | Fort McMurray, AB**

---

## Folder Structure

```
RCIC-IRB WEBSITE MASTER/
│
├── index.html                  ← Admin panel (root entry point — open this)
│
├── public/
│   ├── index.html              ← Public marketing website
│   ├── intake.html             ← 3-step intake gateway (public → portal bridge)
│   └── portal/
│       └── dashboard.html      ← Client-facing portal (case status, tasks, docs, messages)
│
├── admin/
│   ├── index.html              ← Admin panel mirror (same as root index.html, with sections)
│   └── audit.html              ← Audit dashboard (INTERNAL ONLY — never shown to clients)
│
├── shared/
│   ├── css/
│   │   └── portal.css          ← Shared CSS (client portal + admin panel)
│   └── js/
│       ├── data.js             ← Copy of data.js for shared reference
│       └── calendar.js         ← Copy of calendar.js for shared reference
│
├── css/
│   └── styles.css              ← Admin panel styles (full, includes all fixes)
│
└── js/
    ├── data.js                 ← Central data store (DATA object)
    ├── main.js                 ← All admin/portal logic
    ├── calendar.js             ← Calendar (add/edit/delete/flag/priority/reminder)
    ├── chat.js                 ← Team chat + AI assistant
    ├── notes.js                ← Team notes
    └── documents.js            ← IRCC forms + documents
```

---

## How to Open

### Admin Panel (your main tool)
1. Open VS Code → File → Open Folder → `RCIC-IRB WEBSITE MASTER`
2. Install **Live Server** extension (Ritwick Dey)
3. Right-click `index.html` → **Open with Live Server**
4. Opens at `http://127.0.0.1:5500`

### Public Website
→ `http://127.0.0.1:5500/public/index.html`

### Client Portal
→ `http://127.0.0.1:5500/public/portal/dashboard.html`

### Audit Dashboard (internal only)
→ `http://127.0.0.1:5500/admin/audit.html`

> ⚠️ Must use Live Server — direct file:// opening won't work.

---

## System Architecture

```
PUBLIC WEBSITE          → intake gateway      → CLIENT PORTAL
public/index.html         public/intake.html    public/portal/dashboard.html
  Marketing site            3-step form           Case status + tasks
  Service descriptions      Auto file ID          Document uploads
  CTAs to start             Account creation       Messages from RCIC
                                                  NO audit data visible

                                    ↓

                            ADMIN PANEL                  AUDIT ENGINE
                            index.html (root)            admin/audit.html
                            admin/index.html               Case score 0–100
                              KPI dashboard                IRPA inadmissibility grid
                              Calendar (full)              Per-case pre-sub checklist
                              Cases + Tasks                Red alert banners
                              Checklists                   Export audit CSV
                              Agreements (2-step)          INTERNAL ONLY
                              Team notes + chat
                              Activity log
                              Reports + CSV export
```

---

## What's Built

### Public Website (`public/index.html`)
- Hero section with CTAs
- 6 service cards (each links to intake with pre-filled app type)
- How It Works — 4 steps
- Trust signals (CICC, bilingual, PIPEDA, portal)
- Contact section with message form
- Footer

### Intake Gateway (`public/intake.html`)
- Step 1: Personal info, current status, application type selection
- Step 2: Background questions (bilingual English/Tigrinya) — criminal, removal, refusal, military, health, fraud
- Step 3: Account creation, auto-generated file ID, consent checkboxes
- sessionStorage bridge passes data to client portal

### Client Portal (`public/portal/dashboard.html`)
- Login gate (demo: any email + 6+ char password)
- My Case tab: stage tracker, next steps, consultant info
- My Tasks tab: action items with priority badges
- Documents tab: bilingual checklist, file upload
- Messages tab: messages from consultant + send message
- Clients NEVER see: audit scores, risk scores, team notes, inadmissibility

### Admin Panel (`index.html` / `admin/index.html`)
- Full sidebar navigation with sections
- Dashboard: KPIs, charts, upcoming tasks/appointments, opportunities
- Calendar: add/edit/delete events, flag, priority, reminders, ICS export
- Cases: table with filter/search
- Tasks: assignee filter, status filter, add/complete/delete
- New Intake: full intake form → creates case in STATE
- Checklists: per-application-type, bilingual, IRCC links, CSV export
- Agreements: 2-step mandatory flow (consultation FIRST, then service)
- Inadmissibility: IRPA ss.34–42, ENF 1 grounds, color-coded
- Risk Score: 0–100 based on inadmissibility + agreement status
- Team Notes: case notes, planning, action items, reminders
- Team Chat: channels + AI assistant
- Documents: IRCC forms with direct links, country requirements
- Reports: cases CSV, tasks CSV, activity CSV, print/PDF
- Activity Log: team login history + actions per member

### Audit Dashboard (`admin/audit.html`) — INTERNAL ONLY
- Case selector (all cases from DATA)
- Audit score 0–100 with animated bar and color coding
- Red alert banner if inadmissible flags found
- IRPA inadmissibility quick reference grid (all 10 sections, all items)
- Audit flags panel with color-coded issues
- Full pre-submission checklist (pass/fail for each criterion)
- Export audit CSV per case

---

## Key Fixes Applied
- **Agreement overlap**: `.agreement-text` scrolls independently (max-height 220px), signature block and checkbox sit cleanly below with `z-index:1`
- **Calendar rewrite**: full add/edit/delete, flag ★, priority (high/medium/low), reminder, type colors, "+N more" overflow
- **No function conflicts**: `openEventModal()` and `saveEvent()` defined only in `calendar.js`; removed from `main.js`

---

## Customization

### Change company info
→ Edit `js/data.js` → `DATA.company` section at top

### Change colors
→ Edit `css/styles.css` → `:root` section

### Add application type
→ `js/data.js` → `DATA.application_types` array
→ `js/data.js` → `DATA.checklists` object (add matching key)

### Add team members
→ `js/data.js` → `DATA.team_members` array

---

## GitHub Pages Hosting

1. Push the entire folder to a GitHub repo
2. Settings → Pages → Source: `main` branch, `/ (root)`
3. Public site: `https://yourname.github.io/repo-name/public/`
4. Admin panel: `https://yourname.github.io/repo-name/` (password-protect recommended)

---

## Legal Notes
- Service agreement based on CICC-compliant templates — have a lawyer review before use
- Inadmissibility criteria from IRCC ENF 1 Manual — verify current IRPA provisions
- Electronic signatures valid under Canada's Electronic Commerce Act
- PIPEDA/FOIP compliance required for any client data storage
- Country requirements sourced from IRCC — always verify current requirements
