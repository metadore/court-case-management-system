import { describe, it, expect } from "vitest";
import {
  getWorkflowConfig,
  getAllWorkflowConfigs,
  calculateFilingFee,
  generateCaseNumberWithCountry,
  isStatuteOfLimitationsExpired,
  getAppealDeadline,
} from "../workflow.js";

describe("getWorkflowConfig", () => {
  it("should return US config by default", () => {
    const config = getWorkflowConfig("US");
    expect(config.countryCode).toBe("US");
    expect(config.defaultCurrency).toBe("USD");
  });

  it("should return NZ config for New Zealand", () => {
    const config = getWorkflowConfig("NZ");
    expect(config.countryCode).toBe("NZ");
    expect(config.defaultCurrency).toBe("NZD");
    expect(config.caseNumberPrefix).toBe("NZ-");
  });

  it("should fallback to US for unknown country codes", () => {
    const config = getWorkflowConfig("XX");
    expect(config.countryCode).toBe("US");
  });

  it("should be case-insensitive", () => {
    const config = getWorkflowConfig("uk");
    expect(config.countryCode).toBe("UK");
    expect(config.defaultCurrency).toBe("GBP");
  });
});

describe("getAllWorkflowConfigs", () => {
  it("should return all configured countries", () => {
    const configs = getAllWorkflowConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(5);
    const codes = configs.map((c) => c.countryCode);
    expect(codes).toContain("US");
    expect(codes).toContain("UK");
    expect(codes).toContain("CA");
    expect(codes).toContain("AU");
    expect(codes).toContain("NZ");
  });
});

describe("calculateFilingFee", () => {
  it("should return the default filing fee for a country", () => {
    const fee = calculateFilingFee("US", "civil");
    expect(fee.amount).toBeGreaterThan(0);
    expect(fee.currency).toBe("USD");
    expect(fee.waiverAvailable).toBe(true);
  });

  it("should return country-specific fees", () => {
    const usFee = calculateFilingFee("US", "civil");
    const ukFee = calculateFilingFee("UK", "civil");
    expect(usFee.currency).toBe("USD");
    expect(ukFee.currency).toBe("GBP");
  });

  it("should return fee for specific fee types", () => {
    const motionFee = calculateFilingFee("US", "motion", "filing");
    expect(motionFee.amount).toBeGreaterThan(0);
  });
});

describe("generateCaseNumberWithCountry", () => {
  it("should generate a case number with country prefix", () => {
    const num = generateCaseNumberWithCountry("NZ", 1, 2026);
    expect(num).toMatch(/^NZ-2026-00001$/);
  });

  it("should leave US case numbers without prefix", () => {
    const num = generateCaseNumberWithCountry("US", 42, 2026);
    expect(num).toMatch(/^2026-00042$/);
  });

  it("should pad sequence numbers to 5 digits", () => {
    const num = generateCaseNumberWithCountry("UK", 99999, 2026);
    expect(num).toMatch(/^UK-2026-99999$/);
  });
});

describe("isStatuteOfLimitationsExpired", () => {
  it("should return true for very old dates", () => {
    const oldDate = new Date("2000-01-01");
    expect(isStatuteOfLimitationsExpired("US", oldDate)).toBe(true);
  });

  it("should return false for recent dates", () => {
    const recentDate = new Date();
    expect(isStatuteOfLimitationsExpired("US", recentDate)).toBe(false);
  });
});

describe("getAppealDeadline", () => {
  it("should return a date in the future", () => {
    const judgmentDate = new Date("2026-06-01");
    const deadline = getAppealDeadline("US", judgmentDate);
    expect(deadline > judgmentDate).toBe(true);
  });

  it("should respect country-specific appeal periods", () => {
    const judgmentDate = new Date("2026-06-01");
    const usDeadline = getAppealDeadline("US", judgmentDate);
    const ukDeadline = getAppealDeadline("UK", judgmentDate);

    // UK has 21 days, US has 30 days
    const usDays = (usDeadline.getTime() - judgmentDate.getTime()) / (1000 * 60 * 60 * 24);
    const ukDays = (ukDeadline.getTime() - judgmentDate.getTime()) / (1000 * 60 * 60 * 24);

    expect(usDays).toBeCloseTo(30, 0);
    expect(ukDays).toBeCloseTo(21, 0);
  });
});