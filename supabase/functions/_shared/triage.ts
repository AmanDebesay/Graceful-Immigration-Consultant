// Internal triage for assessment submissions. Runs on the server so the rules are never exposed to clients.
// Thresholds (90 / 30 days) and the STCA / Bill C-12 screens only flag items to verify; they make no legal conclusion.

export type Answers = {
  location?: string; status?: string; services?: string[];
  firstEntryDate?: string; entryMethod?: string; cameFromUS?: string;
  claimMade?: string; claimDate?: string; bocSubmitted?: string; hearingDate?: string;
  decisionReceived?: string; decisionDate?: string; decisionDeadline?: string;
  removalOrder?: string; permitExpiry?: string;
  priorRefusals?: string; criminal?: string; misrep?: string; otherRep?: string;
};

export type Triage = { level: "RED" | "AMBER" | "GREEN"; red: string[]; amber: string[]; notes: string[] };

export function triage(d: Answers, today: Date): Triage {
  const red: string[] = [], amber: string[] = [], notes: string[] = [];
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const ms = (s: string) => { const p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };
  const since = (s?: string) => (s ? Math.floor((t - ms(s)) / 86400000) : null);
  const until = (s?: string) => (s ? Math.ceil((ms(s) - t) / 86400000) : null);
  const svc = d.services ?? [];
  const inCan = d.location === "in";
  const refugeeRelevant = inCan && (svc.includes("refugee") || svc.includes("protectedPR") ||
    d.status === "claimant" || d.status === "protected" || d.claimMade === "yes");

  if (d.removalOrder === "yes") red.push("Removal order, notice to leave, or detention reported. Confirm what was issued, appeal or stay options, and every deadline immediately.");
  else if (d.removalOrder === "unsure") red.push("Client is unsure whether a removal order or detention applies. Clarify immediately.");

  if (d.decisionReceived === "yes") {
    if (!d.decisionDate) red.push("Decision letter received but the date is unknown. Get the letter and work out appeal, review and reapplication deadlines.");
    else {
      const ds = since(d.decisionDate)!;
      if (ds < 0) notes.push("Decision date is in the future. Check the entry.");
      else if (ds <= 90) red.push(`Decision letter dated ${ds} day(s) ago. Check appeal, judicial review and reapplication deadlines now.`);
      else amber.push("Decision letter is more than 90 days old. Check whether any remedy is still open.");
    }
    if (d.decisionDeadline) {
      const du = until(d.decisionDeadline)!;
      if (du < 0) red.push(`The deadline stated in the letter has passed (${-du} day(s) ago).`);
      else if (du <= 30) red.push(`The deadline stated in the letter is in ${du} day(s).`);
    }
  }

  if (d.hearingDate) {
    const hu = until(d.hearingDate)!;
    if (hu < 0) red.push("Hearing date has passed. Find out what happened.");
    else if (hu <= 30) red.push(`Hearing date is in ${hu} day(s).`);
  }

  if (refugeeRelevant && d.claimMade === "yes" && d.bocSubmitted !== "yes") {
    red.push("Refugee claim made but BOC not confirmed as submitted. Check the BOC deadline on the IRB website for how the claim was made.");
  }

  if (d.status === "nostatus") {
    if (!d.permitExpiry) amber.push("No valid status and the expiry date is unknown. Establish the timeline.");
    else {
      const ps = since(d.permitExpiry)!;
      if (ps >= 0 && ps <= 90) red.push(`Status or permit expired ${ps} day(s) ago. Check the restoration window now.`);
      else if (ps > 90) amber.push("Status or permit expired more than 90 days ago. Restoration is likely no longer available. Review options.");
    }
  } else if (d.permitExpiry && ["visitor", "student", "worker"].includes(d.status ?? "")) {
    const pu = until(d.permitExpiry)!;
    if (pu < 0) {
      if (-pu <= 90) red.push(`Permit expired ${-pu} day(s) ago. Check the restoration window now.`);
      else amber.push("Permit expired more than 90 days ago. Review options.");
    } else if (pu <= 30) red.push(`Permit expires in ${pu} day(s). Check whether an extension must be filed before expiry.`);
  }

  if (refugeeRelevant && (d.cameFromUS === "yes" || d.cameFromUS === "unsure") &&
      ["land", "between", "unsure"].includes(d.entryMethod ?? "")) {
    amber.push("Arrived by land, possibly from the United States. Verify Safe Third Country Agreement and Bill C-12 eligibility bars before advising.");
  }
  if (refugeeRelevant && d.firstEntryDate && d.firstEntryDate > "2020-06-24") {
    const end = d.claimMade === "yes" && d.claimDate ? d.claimDate : null;
    const gap = end ? Math.round((ms(end) - ms(d.firstEntryDate)) / 86400000) : since(d.firstEntryDate)!;
    if (gap > 365) amber.push(`More than one year between first arrival and the refugee claim${end ? "" : " (claim not yet made)"}. Verify the Bill C-12 one-year bar.`);
  }

  if (d.criminal === "yes" || d.criminal === "discuss") amber.push("Possible criminal inadmissibility. Take full facts privately at the consultation.");
  if (d.misrep === "yes" || d.misrep === "unsure") amber.push("Possible misrepresentation issue. Review prior applications and any procedural fairness letters.");
  if (d.otherRep === "current") amber.push("Another representative is currently engaged. Confirm status and file transfer before acting.");
  if (d.otherRep === "former") notes.push("Previous representative. Request the client file.");
  if (d.priorRefusals === "yes") notes.push("Prior refusal by Canada. Consider requesting GCMS notes through ATIP.");
  if (svc.includes("review")) notes.push("Refusal review requested. Federal Court judicial review is handled by lawyers only. Refer if that is the route.");
  if (svc.includes("notsure")) notes.push("Client is unsure what they need. Plan extra time at the consultation.");

  return { level: red.length ? "RED" : amber.length ? "AMBER" : "GREEN", red, amber, notes };
}
