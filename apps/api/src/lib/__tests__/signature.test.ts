import { describe, it, expect } from "vitest";
import {
  generateSignatureHash,
  generateHmacSignature,
  verifyHmacSignature,
} from "../signature.js";

describe("generateSignatureHash", () => {
  it("should generate a deterministic hash from the same inputs", () => {
    const payload = {
      documentId: "doc-123",
      userId: "user-456",
      signerName: "John Doe",
      signerRole: "JUDGE",
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    const hash1 = generateSignatureHash(payload);
    const hash2 = generateSignatureHash(payload);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA256 hex
  });

  it("should generate different hashes for different signers", () => {
    const base = {
      documentId: "doc-123",
      userId: "user-456",
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    const hash1 = generateSignatureHash({ ...base, signerName: "Alice", signerRole: "JUDGE" });
    const hash2 = generateSignatureHash({ ...base, signerName: "Bob", signerRole: "LAWYER" });

    expect(hash1).not.toBe(hash2);
  });

  it("should generate different hashes for different timestamps", () => {
    const base = {
      documentId: "doc-123",
      userId: "user-456",
      signerName: "Alice",
      signerRole: "JUDGE",
    };

    const hash1 = generateSignatureHash({ ...base, timestamp: "2026-01-01T00:00:00.000Z" });
    const hash2 = generateSignatureHash({ ...base, timestamp: "2026-06-01T00:00:00.000Z" });

    expect(hash1).not.toBe(hash2);
  });
});

describe("HMAC Signature", () => {
  it("should generate and verify a valid signature", () => {
    const hmac = generateHmacSignature("doc-123", "user-456", "2026-01-01T00:00:00.000Z");
    expect(hmac).toBeTruthy();
    expect(typeof hmac).toBe("string");

    const isValid = verifyHmacSignature("doc-123", "user-456", "2026-01-01T00:00:00.000Z", hmac);
    expect(isValid).toBe(true);
  });

  it("should reject an invalid signature", () => {
    const hmac = generateHmacSignature("doc-123", "user-456", "2026-01-01T00:00:00.000Z");
    const isValid = verifyHmacSignature("doc-456", "user-789", "2026-06-01T00:00:00.000Z", hmac);
    expect(isValid).toBe(false);
  });

  it("should reject a tampered signature", () => {
    const hmac = generateHmacSignature("doc-123", "user-456", "2026-01-01T00:00:00.000Z");
    const tampered = hmac.substring(0, hmac.length - 1) + "a";
    const isValid = verifyHmacSignature("doc-123", "user-456", "2026-01-01T00:00:00.000Z", tampered);
    expect(isValid).toBe(false);
  });
});