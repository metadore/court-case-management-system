// ── Country Configuration Registry ──────────────────────────────────────────
//
// This module provides country-specific workflow configurations including
// fee schedules, case type mappings, document templates, and hearing types.
// Each country can have its own plugin that customizes the court system behavior.

export interface FeeSchedule {
  filingFee: number;
  currency: string;
  lateFee?: number;
  waiverAvailable: boolean;
  fees: Record<string, number>;
}

export interface WorkflowConfig {
  countryCode: string;
  countryName: string;
  defaultCurrency: string;
  defaultLanguage: string;
  dateFormat: string;
  timezone: string;
  feeSchedule: FeeSchedule;
  caseTypes: string[];
  hearingTypes: string[];
  documentTypes: string[];
  partyRoles: string[];
  // Whether case numbers include country prefix
  caseNumberPrefix: string;
  // Statute of limitations in days (default)
  statuteOfLimitationsDays: number;
  // Appeal period in days
  appealPeriodDays: number;
}

// ── Built-in Country Configurations ──────────────────────────────────────────

const unitedStates: WorkflowConfig = {
  countryCode: "US",
  countryName: "United States",
  defaultCurrency: "USD",
  defaultLanguage: "en",
  dateFormat: "MM/DD/YYYY",
  timezone: "America/New_York",
  caseNumberPrefix: "",
  statuteOfLimitationsDays: 365 * 3,
  appealPeriodDays: 30,
  feeSchedule: {
    filingFee: 402,
    currency: "USD",
    waiverAvailable: true,
    fees: {
      civil_complaint: 402,
      motion_filing: 48,
      notice_of_appeal: 505,
      subpoena: 12,
      certificate: 8,
    },
  },
  caseTypes: ["CIVIL", "CRIMINAL", "FAMILY", "PROBATE", "COMMERCIAL", "CONSTITUTIONAL", "APPELLATE", "OTHER"],
  hearingTypes: [
    "ARRAIGNMENT", "BAIL", "PRELIMINARY", "TRIAL", "MOTION_HEARING",
    "SENTENCING", "APPEAL", "STATUS_CONFERENCE", "OTHER",
  ],
  documentTypes: [
    "COMPLAINT", "MOTION", "RESPONSE", "ORDER", "JUDGMENT",
    "NOTICE", "AFFIDAVIT", "EVIDENCE", "TRANSCRIPT", "OTHER",
  ],
  partyRoles: [
    "PLAINTIFF", "DEFENDANT", "COUNSEL_PLAINTIFF", "COUNSEL_DEFENDANT",
    "INTERVENOR", "WITNESS", "AMICUS", "OTHER",
  ],
};

const unitedKingdom: WorkflowConfig = {
  countryCode: "UK",
  countryName: "United Kingdom",
  defaultCurrency: "GBP",
  defaultLanguage: "en",
  dateFormat: "DD/MM/YYYY",
  timezone: "Europe/London",
  caseNumberPrefix: "UK-",
  statuteOfLimitationsDays: 365 * 6,
  appealPeriodDays: 21,
  feeSchedule: {
    filingFee: 10000, // pence (Â£100)
    currency: "GBP",
    waiverAvailable: true,
    fees: {
      civil_complaint: 10000,
      motion_filing: 255,
      notice_of_appeal: 455,
      subpoena: 60,
      certificate: 15,
    },
  },
  caseTypes: ["CIVIL", "CRIMINAL", "FAMILY", "COMMERCIAL", "APPELLATE", "OTHER"],
  hearingTypes: [
    "CASE_MANAGEMENT", "PRELIMINARY", "TRIAL", "SENTENCING",
    "APPEAL", "DIRECTIONS", "OTHER",
  ],
  documentTypes: [
    "CLAIM_FORM", "DEFENCE", "COUNTERCLAIM", "WITNESS_STATEMENT",
    "EXPERT_REPORT", "ORDER", "JUDGMENT", "NOTICE", "OTHER",
  ],
  partyRoles: [
    "CLAIMANT", "DEFENDANT", "INTERVENOR", "WITNESS", "EXPERT", "OTHER",
  ],
};

const canada: WorkflowConfig = {
  countryCode: "CA",
  countryName: "Canada",
  defaultCurrency: "CAD",
  defaultLanguage: "en",
  dateFormat: "YYYY-MM-DD",
  timezone: "America/Toronto",
  caseNumberPrefix: "CA-",
  statuteOfLimitationsDays: 365 * 2,
  appealPeriodDays: 30,
  feeSchedule: {
    filingFee: 5000, // cents ($50)
    currency: "CAD",
    waiverAvailable: true,
    fees: {
      civil_complaint: 5000,
      motion_filing: 1000,
      notice_of_appeal: 5000,
      subpoena: 500,
      certificate: 250,
    },
  },
  caseTypes: ["CIVIL", "CRIMINAL", "FAMILY", "PROBATE", "COMMERCIAL", "APPELLATE", "OTHER"],
  hearingTypes: [
    "CASE_CONFERENCE", "PRELIMINARY", "TRIAL", "SENTENCING",
    "APPEAL", "MOTION_HEARING", "SETTLEMENT", "OTHER",
  ],
  documentTypes: [
    "STATEMENT_OF_CLAIM", "DEFENCE", "MOTION", "ORDER",
    "JUDGMENT", "NOTICE", "AFFIDAVIT", "EVIDENCE", "TRANSCRIPT", "OTHER",
  ],
  partyRoles: [
    "PLAINTIFF", "DEFENDANT", "THIRD_PARTY", "INTERVENOR",
    "WITNESS", "AMICUS", "OTHER",
  ],
};

const australia: WorkflowConfig = {
  countryCode: "AU",
  countryName: "Australia",
  defaultCurrency: "AUD",
  defaultLanguage: "en",
  dateFormat: "DD/MM/YYYY",
  timezone: "Australia/Sydney",
  caseNumberPrefix: "AU-",
  statuteOfLimitationsDays: 365 * 3,
  appealPeriodDays: 28,
  feeSchedule: {
    filingFee: 15000, // cents ($150)
    currency: "AUD",
    waiverAvailable: true,
    fees: {
      civil_complaint: 15000,
      motion_filing: 1300,
      notice_of_appeal: 7500,
      subpoena: 700,
      certificate: 350,
    },
  },
  caseTypes: ["CIVIL", "CRIMINAL", "FAMILY", "PROBATE", "COMMERCIAL", "APPELLATE", "OTHER"],
  hearingTypes: [
    "DIRECTIONS", "CASE_MANAGEMENT", "PRELIMINARY", "TRIAL",
    "SENTENCING", "APPEAL", "MOTION_HEARING", "OTHER",
  ],
  documentTypes: [
    "WRIT", "STATEMENT_OF_CLAIM", "DEFENCE", "MOTION",
    "ORDER", "JUDGMENT", "NOTICE", "AFFIDAVIT", "TRANSCRIPT", "OTHER",
  ],
  partyRoles: [
    "PLAINTIFF", "DEFENDANT", "CROSS_CLAIMANT", "CROSS_DEFENDANT",
    "INTERVENOR", "WITNESS", "OTHER",
  ],
};

const newZealand: WorkflowConfig = {
  countryCode: "NZ",
  countryName: "New Zealand",
  defaultCurrency: "NZD",
  defaultLanguage: "en",
  dateFormat: "DD/MM/YYYY",
  timezone: "Pacific/Auckland",
  caseNumberPrefix: "NZ-",
  statuteOfLimitationsDays: 365 * 6,
  appealPeriodDays: 20,
  feeSchedule: {
    filingFee: 15000, // cents ($150)
    currency: "NZD",
    waiverAvailable: true,
    fees: {
      civil_complaint: 15000,
      motion_filing: 1000,
      notice_of_appeal: 7000,
      subpoena: 500,
      certificate: 300,
    },
  },
  caseTypes: ["CIVIL", "CRIMINAL", "FAMILY", "PROBATE", "COMMERCIAL", "APPELLATE", "OTHER"],
  hearingTypes: [
    "CASE_MANAGEMENT", "PRELIMINARY", "TRIAL", "SENTENCING",
    "APPEAL", "MOTION_HEARING", "JUDICIAL_CONFERENCE", "OTHER",
  ],
  documentTypes: [
    "STATEMENT_OF_CLAIM", "NOTICE_OF_PROCEEDING", "DEFENCE", "MOTION",
    "ORDER", "JUDGMENT", "NOTICE", "AFFIDAVIT", "TRANSCRIPT", "OTHER",
  ],
  partyRoles: [
    "PLAINTIFF", "DEFENDANT", "THIRD_PARTY", "INTERVENOR",
    "WITNESS", "AMICUS", "OTHER",
  ],
};

// ── Registry ────────────────────────────────────────────────────────────────

const workflowRegistry: Map<string, WorkflowConfig> = new Map([
  ["US", unitedStates],
  ["UK", unitedKingdom],
  ["CA", canada],
  ["AU", australia],
  ["NZ", newZealand],
]);

/**
 * Get the workflow configuration for a given country code.
 * Falls back to US if not found.
 */
export function getWorkflowConfig(countryCode: string): WorkflowConfig {
  return workflowRegistry.get(countryCode.toUpperCase()) ?? unitedStates;
}

/**
 * Get all available country configurations.
 */
export function getAllWorkflowConfigs(): WorkflowConfig[] {
  return Array.from(workflowRegistry.values());
}

/**
 * Calculate the filing fee for a given case type and country.
 */
export function calculateFilingFee(
  countryCode: string,
  caseType: string,
  feeType: string = "filing_fee",
): { amount: number; currency: string; waiverAvailable: boolean } {
  const config = getWorkflowConfig(countryCode);
  const feeKey = `${caseType.toLowerCase()}_${feeType}`;
  const amount = config.feeSchedule.fees[feeKey] ?? config.feeSchedule.filingFee;

  return {
    amount,
    currency: config.defaultCurrency,
    waiverAvailable: config.feeSchedule.waiverAvailable,
  };
}

/**
 * Generate a country-prefixed case number.
 */
export function generateCaseNumberWithCountry(
  countryCode: string,
  sequence: number,
  year?: number,
): string {
  const config = getWorkflowConfig(countryCode);
  const yr = year ?? new Date().getFullYear();
  const seq = String(sequence).padStart(5, "0");
  return `${config.caseNumberPrefix}${yr}-${seq}`;
}

/**
 * Check if a country's statute of limitations has expired.
 */
export function isStatuteOfLimitationsExpired(
  countryCode: string,
  incidentDate: Date,
): boolean {
  const config = getWorkflowConfig(countryCode);
  const limit = config.statuteOfLimitationsDays;
  const deadline = new Date(incidentDate);
  deadline.setDate(deadline.getDate() + limit);
  return new Date() > deadline;
}

/**
 * Calculate the appeal deadline for a given country.
 */
export function getAppealDeadline(
  countryCode: string,
  judgmentDate: Date,
): Date {
  const config = getWorkflowConfig(countryCode);
  const deadline = new Date(judgmentDate);
  deadline.setDate(deadline.getDate() + config.appealPeriodDays);
  return deadline;
}