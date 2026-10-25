// Staff AI assistant (Claude) for the Practice Hub: answers practice questions and reviews assessments.
// Staff only (company email). Direct identifiers are removed from assessments before they are sent.
import { adminClient, callerProfile, corsHeaders, hasPerm, json } from "../_shared/common.ts";
import { cleanMessages, streamClaude } from "../_shared/claude.ts";

const IDENTIFIERS = new Set(["fullName", "email", "phone", "contactPref"]);
const LABELS: Record<string, string> = {
  language: "Preferred language", languageOther: "Other language", location: "Location (in/outside Canada)", status: "Current status in Canada",
  citizenship: "Citizenship", firstEntryDate: "First entry to Canada", entryMethod: "How they entered", cameFromUS: "Came from the U.S.",
  claimMade: "Refugee claim made", claimDate: "Claim date", bocSubmitted: "Basis of Claim submitted", hearingDate: "Hearing date",
  decisionReceived: "Decision received", decisionDate: "Decision date", decisionFrom: "Decision from", decisionDeadline: "Deadline from decision",
  removalOrder: "Removal order", permitExpiry: "Permit expiry", priorRefusals: "Prior refusals", criminal: "Criminal history",
  misrep: "Possible misrepresentation", otherRep: "Other representative", notes: "Client notes", services: "Services requested", familyOnApp: "Family on application",
};

const BASE = `You are the in-house AI assistant for Graceful Immigration Consultant Inc., a Canadian immigration practice run by a Regulated Canadian Immigration Consultant (RCIC-IRB). You help the RCIC and staff with:
- reviewing client assessments: likely programs and pathways, eligibility issues, risks and red flags, missing information, documents to request, deadlines, and questions for the consultation;
- answering questions on Canadian immigration, refugee and citizenship law and IRCC/IRB procedure (IRPA, IRPR, Citizenship Act, program delivery instructions, IRB rules and Chairperson's guidelines);
- drafting client emails, document checklists, submission-letter outlines and file notes.

How to answer:
- Be accurate and practical. Cite the provision or source when you rely on one (e.g. "IRPR s. 117(9)(d)", "IRPA s. 96/97", "RPD Rules r. 29").
- Rules, fees, processing times, draws and program caps change often. Say when something should be verified on the current official source, and never invent case names, citations, numbers or dates.
- If information is missing, say what you'd need to know rather than guessing.
- Flag urgent risks first: removal orders, hearing dates, limitation periods (e.g. 15 days for RAD appeals and Federal Court leave), status expiry, inadmissibility, misrepresentation.
- You support the RCIC; you do not replace their professional judgement. Final advice to clients comes from the RCIC.
- Use clear headings and short bullet points. Write in Canadian English.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const admin = adminClient();
  const caller = await callerProfile(req, admin);
  if (!caller || caller.role === "client") return json(req, { error: "Not allowed" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }
  const messages = cleanMessages(body.messages, 40, 12000);
  if (!messages) return json(req, { error: "Send a question." }, 400);

  const { data: s } = await admin.from("org_settings").select("ai_staff_instructions, business_name, rcic_name").eq("id", 1).single();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  let system = `${BASE}\n\nToday's date: ${today} (Alberta). Practice: ${s?.business_name ?? ""}; RCIC: ${s?.rcic_name ?? ""}.`;
  if (s?.ai_staff_instructions?.trim()) system += `\n\nPractice instructions from the RCIC (follow these):\n${s.ai_staff_instructions.trim()}`;

  const assessmentId = typeof body.assessment_id === "string" ? body.assessment_id : "";
  if (assessmentId) {
    if (!(await hasPerm(admin, caller.role, "intake.view"))) return json(req, { error: "You don't have access to assessments." }, 403);
    const { data: a } = await admin.from("intake_submissions").select("answers, triage_level, triage, created_at").eq("id", assessmentId).maybeSingle();
    if (!a) return json(req, { error: "Assessment not found." }, 404);
    const lines = Object.entries(a.answers ?? {})
      .filter(([k, v]) => !IDENTIFIERS.has(k) && v !== null && v !== "" && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => `- ${LABELS[k] ?? k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : v}`);
    const t = a.triage ?? {};
    system += `\n\nThe staff member has attached a client assessment (submitted ${String(a.created_at).slice(0, 10)}). Name and contact details were removed for privacy; refer to the person as "the client".
Automatic triage level: ${a.triage_level}
Red flags: ${(t.red ?? []).join("; ") || "none"}
Amber flags: ${(t.amber ?? []).join("; ") || "none"}
Notes: ${(t.notes ?? []).join("; ") || "none"}
Answers:
${lines.join("\n")}`;
  }

  return streamClaude(req, admin, {
    kind: "staff", userId: caller.id, system, messages, maxTokens: 4000,
    model: Deno.env.get("AI_STAFF_MODEL") ?? "claude-opus-5-5",
  });
});
