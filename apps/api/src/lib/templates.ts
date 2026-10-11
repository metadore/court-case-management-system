// Built-in document templates with variable substitution.
// Variables are wrapped in {{VARIABLE_NAME}} and replaced at generation time.

export interface TemplateVariable {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "date" | "number" | "textarea";
  defaultValue?: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  category: "ORDER" | "NOTICE" | "MOTION" | "JUDGMENT" | "SUMMONS" | "OTHER";
  applicableCaseTypes: string[];
  variables: TemplateVariable[];
  body: string;
}

const TEMPLATES: DocumentTemplate[] = [
  {
    id: "summons",
    name: "Summons",
    description: "Standard summons to appear in court",
    category: "SUMMONS",
    applicableCaseTypes: ["CIVIL", "CRIMINAL", "FAMILY", "COMMERCIAL"],
    variables: [
      { key: "COURT_NAME", label: "Court Name", required: true, type: "text" },
      { key: "CASE_NUMBER", label: "Case Number", required: true, type: "text" },
      { key: "PLAINTIFF_NAME", label: "Plaintiff Name", required: true, type: "text" },
      { key: "DEFENDANT_NAME", label: "Defendant Name", required: true, type: "text" },
      { key: "RESPONSE_DEADLINE", label: "Response Deadline", required: true, type: "date" },
      { key: "COURT_ADDRESS", label: "Court Address", required: true, type: "text" },
      { key: "JUDGE_NAME", label: "Judge Name", required: false, type: "text", defaultValue: "To be assigned" },
      { key: "CLERK_NAME", label: "Clerk of Court", required: false, type: "text", defaultValue: "Clerk of Court" },
      { key: "ISSUED_DATE", label: "Date Issued", required: true, type: "date" },
    ],
    body: `IN THE {{COURT_NAME}}

Case No. {{CASE_NUMBER}}

{{PLAINTIFF_NAME}},
    Plaintiff,

v.

{{DEFENDANT_NAME}},
    Defendant.

─────────────────────────────────────────

SUMMONS

TO: {{DEFENDANT_NAME}}

You have been sued. The person(s) suing you is named in the above complaint.

YOU ARE SUMMONED to appear before this court and answer the complaint within {{RESPONSE_DEADLINE}} after service of this summons on you, exclusive of the day of service.

If you fail to respond, judgment by default will be taken against you for the relief demanded in the complaint. A copy of the complaint is attached.

ISSUED at {{COURT_ADDRESS}} on {{ISSUED_DATE}}.

                                        {{CLERK_NAME}}
                                        Clerk of Court

                                        By: ____________________________
                                            Deputy Clerk

Assigned Judge: {{JUDGE_NAME}}
`,
  },
  {
    id: "notice_of_hearing",
    name: "Notice of Hearing",
    description: "Notice to parties of a scheduled hearing",
    category: "NOTICE",
    applicableCaseTypes: ["CIVIL", "CRIMINAL", "FAMILY", "COMMERCIAL", "PROBATE", "APPELLATE"],
    variables: [
      { key: "COURT_NAME", label: "Court Name", required: true, type: "text" },
      { key: "CASE_NUMBER", label: "Case Number", required: true, type: "text" },
      { key: "CASE_TITLE", label: "Case Title (Plaintiff v. Defendant)", required: true, type: "text" },
      { key: "HEARING_TYPE", label: "Type of Hearing", required: true, type: "text" },
      { key: "HEARING_DATE", label: "Hearing Date", required: true, type: "date" },
      { key: "HEARING_TIME", label: "Hearing Time", required: true, type: "text" },
      { key: "COURTROOM", label: "Courtroom / Location", required: true, type: "text" },
      { key: "JUDGE_NAME", label: "Presiding Judge", required: false, type: "text", defaultValue: "To be assigned" },
      { key: "PARTIES_ADDRESSED", label: "Parties (names to notify)", required: true, type: "textarea" },
      { key: "ADDITIONAL_INSTRUCTIONS", label: "Additional Instructions", required: false, type: "textarea", defaultValue: "" },
      { key: "ISSUED_DATE", label: "Date Issued", required: true, type: "date" },
      { key: "CLERK_NAME", label: "Clerk of Court", required: false, type: "text", defaultValue: "Clerk of Court" },
    ],
    body: `IN THE {{COURT_NAME}}

Case No. {{CASE_NUMBER}}
{{CASE_TITLE}}

─────────────────────────────────────────

NOTICE OF HEARING

TO: {{PARTIES_ADDRESSED}}

PLEASE TAKE NOTICE that a {{HEARING_TYPE}} in the above-captioned matter has been scheduled as follows:

    Date:       {{HEARING_DATE}}
    Time:       {{HEARING_TIME}}
    Location:   {{COURTROOM}}
                {{COURT_NAME}}
    Judge:      {{JUDGE_NAME}}

ALL PARTIES ARE REQUIRED TO APPEAR. Failure to appear may result in dismissal of your claims, entry of default judgment, or other sanctions.

{{ADDITIONAL_INSTRUCTIONS}}

Issued on {{ISSUED_DATE}}.

                                        {{CLERK_NAME}}
                                        Clerk of Court
`,
  },
  {
    id: "order_to_show_cause",
    name: "Order to Show Cause",
    description: "Order requiring a party to appear and show cause why a certain order should not be made",
    category: "ORDER",
    applicableCaseTypes: ["CIVIL", "FAMILY", "COMMERCIAL", "PROBATE"],
    variables: [
      { key: "COURT_NAME", label: "Court Name", required: true, type: "text" },
      { key: "CASE_NUMBER", label: "Case Number", required: true, type: "text" },
      { key: "CASE_TITLE", label: "Case Title", required: true, type: "text" },
      { key: "RESPONDENT_NAME", label: "Respondent Name", required: true, type: "text" },
      { key: "RELIEF_SOUGHT", label: "Relief Sought / Reason", required: true, type: "textarea" },
      { key: "HEARING_DATE", label: "Show Cause Hearing Date", required: true, type: "date" },
      { key: "HEARING_TIME", label: "Hearing Time", required: true, type: "text" },
      { key: "JUDGE_NAME", label: "Judge Name", required: true, type: "text" },
      { key: "ORDER_DATE", label: "Date of Order", required: true, type: "date" },
    ],
    body: `IN THE {{COURT_NAME}}

Case No. {{CASE_NUMBER}}
{{CASE_TITLE}}

─────────────────────────────────────────

ORDER TO SHOW CAUSE

TO: {{RESPONDENT_NAME}}

IT IS HEREBY ORDERED that {{RESPONDENT_NAME}} appear before this Court on {{HEARING_DATE}} at {{HEARING_TIME}} and show cause, if any, why the following relief should not be granted:

{{RELIEF_SOUGHT}}

FAILURE TO APPEAR may result in the Court granting the requested relief without further notice.

IT IS SO ORDERED this {{ORDER_DATE}}.

                                        ____________________________
                                        {{JUDGE_NAME}}
                                        Judge, {{COURT_NAME}}
`,
  },
  {
    id: "default_judgment",
    name: "Default Judgment",
    description: "Judgment entered against a party who failed to respond or appear",
    category: "JUDGMENT",
    applicableCaseTypes: ["CIVIL", "COMMERCIAL"],
    variables: [
      { key: "COURT_NAME", label: "Court Name", required: true, type: "text" },
      { key: "CASE_NUMBER", label: "Case Number", required: true, type: "text" },
      { key: "PLAINTIFF_NAME", label: "Plaintiff Name", required: true, type: "text" },
      { key: "DEFENDANT_NAME", label: "Defendant Name", required: true, type: "text" },
      { key: "JUDGMENT_AMOUNT", label: "Judgment Amount ($)", required: false, type: "number", defaultValue: "0.00" },
      { key: "RELIEF_GRANTED", label: "Relief Granted (describe)", required: true, type: "textarea" },
      { key: "REASON_FOR_DEFAULT", label: "Reason for Default", required: true, type: "text", defaultValue: "failure to appear or respond" },
      { key: "JUDGE_NAME", label: "Judge Name", required: true, type: "text" },
      { key: "JUDGMENT_DATE", label: "Date of Judgment", required: true, type: "date" },
    ],
    body: `IN THE {{COURT_NAME}}

Case No. {{CASE_NUMBER}}

{{PLAINTIFF_NAME}},
    Plaintiff,

v.

{{DEFENDANT_NAME}},
    Defendant.

─────────────────────────────────────────

DEFAULT JUDGMENT

The above-named Defendant, {{DEFENDANT_NAME}}, having failed to plead or otherwise defend this action due to {{REASON_FOR_DEFAULT}}, and the default of said Defendant having been duly noted by the Clerk of Court;

IT IS HEREBY ORDERED AND ADJUDGED that:

{{RELIEF_GRANTED}}

{{#if JUDGMENT_AMOUNT}}
The Plaintiff, {{PLAINTIFF_NAME}}, shall recover from the Defendant, {{DEFENDANT_NAME}}, the sum of \${{JUDGMENT_AMOUNT}}, together with post-judgment interest at the applicable legal rate.
{{/if}}

This judgment is entered on {{JUDGMENT_DATE}}.

                                        ____________________________
                                        {{JUDGE_NAME}}
                                        Judge, {{COURT_NAME}}

ENTERED: {{JUDGMENT_DATE}}
`,
  },
  {
    id: "case_dismissal",
    name: "Order of Dismissal",
    description: "Order dismissing a case with or without prejudice",
    category: "ORDER",
    applicableCaseTypes: ["CIVIL", "CRIMINAL", "FAMILY", "COMMERCIAL", "PROBATE"],
    variables: [
      { key: "COURT_NAME", label: "Court Name", required: true, type: "text" },
      { key: "CASE_NUMBER", label: "Case Number", required: true, type: "text" },
      { key: "CASE_TITLE", label: "Case Title", required: true, type: "text" },
      { key: "DISMISSAL_TYPE", label: "With or Without Prejudice", required: true, type: "text", defaultValue: "without prejudice" },
      { key: "REASON_FOR_DISMISSAL", label: "Reason for Dismissal", required: true, type: "textarea" },
      { key: "JUDGE_NAME", label: "Judge Name", required: true, type: "text" },
      { key: "ORDER_DATE", label: "Date of Order", required: true, type: "date" },
    ],
    body: `IN THE {{COURT_NAME}}

Case No. {{CASE_NUMBER}}
{{CASE_TITLE}}

─────────────────────────────────────────

ORDER OF DISMISSAL

This matter came before the Court on the following grounds:

{{REASON_FOR_DISMISSAL}}

IT IS HEREBY ORDERED that the above-captioned case is DISMISSED {{DISMISSAL_TYPE}}.

Each party shall bear its own costs and attorneys' fees unless otherwise specified herein.

IT IS SO ORDERED this {{ORDER_DATE}}.

                                        ____________________________
                                        {{JUDGE_NAME}}
                                        Judge, {{COURT_NAME}}
`,
  },
  {
    id: "motion_to_continue",
    name: "Motion for Continuance",
    description: "Request to postpone a hearing or deadline",
    category: "MOTION",
    applicableCaseTypes: ["CIVIL", "CRIMINAL", "FAMILY", "COMMERCIAL", "PROBATE", "APPELLATE"],
    variables: [
      { key: "COURT_NAME", label: "Court Name", required: true, type: "text" },
      { key: "CASE_NUMBER", label: "Case Number", required: true, type: "text" },
      { key: "CASE_TITLE", label: "Case Title", required: true, type: "text" },
      { key: "MOVING_PARTY", label: "Moving Party Name", required: true, type: "text" },
      { key: "CURRENT_HEARING_DATE", label: "Current Hearing Date", required: true, type: "date" },
      { key: "REASON_FOR_CONTINUANCE", label: "Reason for Continuance", required: true, type: "textarea" },
      { key: "PROPOSED_DATE", label: "Proposed New Date (if any)", required: false, type: "date", defaultValue: "" },
      { key: "ATTORNEY_NAME", label: "Attorney Name (or Pro Se)", required: false, type: "text", defaultValue: "Pro Se" },
      { key: "FILING_DATE", label: "Date Filed", required: true, type: "date" },
    ],
    body: `IN THE {{COURT_NAME}}

Case No. {{CASE_NUMBER}}
{{CASE_TITLE}}

─────────────────────────────────────────

MOTION FOR CONTINUANCE

{{MOVING_PARTY}}, by and through its undersigned counsel/pro se, respectfully moves this Court to continue the hearing currently scheduled for {{CURRENT_HEARING_DATE}}, and in support thereof states:

1. The above-captioned matter is currently scheduled for hearing on {{CURRENT_HEARING_DATE}}.

2. Good cause exists for a continuance as follows:

{{REASON_FOR_CONTINUANCE}}

3. {{#if PROPOSED_DATE}}The moving party proposes rescheduling to {{PROPOSED_DATE}} or another date convenient to the Court.{{else}}The moving party respectfully requests that the Court set a new date at its earliest convenience.{{/if}}

4. This motion is not made for purposes of delay but in the interest of justice.

WHEREFORE, {{MOVING_PARTY}} respectfully requests that this Court grant this Motion for Continuance.

Respectfully submitted,

Date: {{FILING_DATE}}

                                        {{ATTORNEY_NAME}}
                                        Counsel for {{MOVING_PARTY}}
`,
  },
  {
    id: "subpoena",
    name: "Subpoena (Witness)",
    description: "Subpoena commanding a witness to appear and testify",
    category: "OTHER",
    applicableCaseTypes: ["CIVIL", "CRIMINAL", "FAMILY", "COMMERCIAL"],
    variables: [
      { key: "COURT_NAME", label: "Court Name", required: true, type: "text" },
      { key: "CASE_NUMBER", label: "Case Number", required: true, type: "text" },
      { key: "CASE_TITLE", label: "Case Title", required: true, type: "text" },
      { key: "WITNESS_NAME", label: "Witness Name", required: true, type: "text" },
      { key: "WITNESS_ADDRESS", label: "Witness Address", required: true, type: "text" },
      { key: "APPEARANCE_DATE", label: "Date of Required Appearance", required: true, type: "date" },
      { key: "APPEARANCE_TIME", label: "Time of Required Appearance", required: true, type: "text" },
      { key: "LOCATION", label: "Location", required: true, type: "text" },
      { key: "DOCUMENTS_REQUIRED", label: "Documents to Bring (leave blank if none)", required: false, type: "textarea", defaultValue: "" },
      { key: "ISSUED_DATE", label: "Date Issued", required: true, type: "date" },
      { key: "CLERK_NAME", label: "Clerk of Court", required: false, type: "text", defaultValue: "Clerk of Court" },
    ],
    body: `IN THE {{COURT_NAME}}

Case No. {{CASE_NUMBER}}
{{CASE_TITLE}}

─────────────────────────────────────────

SUBPOENA TO TESTIFY AT A HEARING OR TRIAL

TO: {{WITNESS_NAME}}
    {{WITNESS_ADDRESS}}

YOU ARE COMMANDED to appear in the above-named court to testify at the time and place set forth below:

    Date:       {{APPEARANCE_DATE}}
    Time:       {{APPEARANCE_TIME}}
    Place:      {{LOCATION}}

{{#if DOCUMENTS_REQUIRED}}
YOU ARE ALSO COMMANDED to bring with you the following documents or objects:

{{DOCUMENTS_REQUIRED}}
{{/if}}

FAILURE TO COMPLY with this subpoena may subject you to penalties and contempt of court.

ISSUED by authority of the {{COURT_NAME}} on {{ISSUED_DATE}}.

                                        {{CLERK_NAME}}
                                        Clerk of Court

                                        By: ____________________________
                                            Deputy Clerk
`,
  },
];

export function getAllTemplates(): DocumentTemplate[] {
  return TEMPLATES;
}

export function getTemplateById(id: string): DocumentTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesForCaseType(caseType: string): DocumentTemplate[] {
  return TEMPLATES.filter(
    (t) => t.applicableCaseTypes.includes(caseType) || t.applicableCaseTypes.length === 0
  );
}

/**
 * Substitute variables in a template body.
 * Replaces {{VARIABLE_NAME}} with provided values.
 * Simple conditional blocks: {{#if VAR}}content{{/if}} included only if VAR is non-empty.
 */
export function renderTemplate(template: DocumentTemplate, variables: Record<string, string>): string {
  let output = template.body;

  // Process {{#if VAR}}...{{/if}} conditionals
  output = output.replace(/\{\{#if ([A-Z_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, varName: string, content: string) => {
    const value = variables[varName] ?? template.variables.find((v) => v.key === varName)?.defaultValue ?? "";
    return value && value.trim() !== "" ? content : "";
  });

  // Replace all {{VAR}} tokens
  for (const v of template.variables) {
    const value = variables[v.key] ?? v.defaultValue ?? "";
    output = output.replace(new RegExp(`\\{\\{${v.key}\\}\\}`, "g"), value);
  }

  return output;
}
