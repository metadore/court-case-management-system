import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import crypto from "node:crypto";
import { getFileBuffer, uploadFile } from "./storage.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SignaturePayload {
  documentId: string;
  userId: string;
  signerName: string;
  signerRole: string;
  signerEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SignatureResult {
  signatureHash: string;
  signedAt: string;
  filePath: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HASH_ALGORITHM = "sha256";
const SIGNATURE_STAMP_TEXT = "Electronically Signed by";

// ── Hash generation ──────────────────────────────────────────────────────────

/**
 * Generate a keyed HMAC signature hash from the payload.
 * Uses SIGNING_SECRET so the identifier cannot be forged by anyone who knows only
 * the public inputs (documentId, userId, signerName, signerRole, timestamp).
 */
export function generateSignatureHash(payload: {
  documentId: string;
  userId: string;
  signerName: string;
  signerRole: string;
  timestamp: string;
}): string {
  const secret = process.env["SIGNING_SECRET"];
  const data = `${payload.documentId}|${payload.userId}|${payload.signerName}|${payload.signerRole}|${payload.timestamp}`;
  return crypto.createHmac(HASH_ALGORITHM, secret!).update(data).digest("hex");
}

/**
 * Generate a symmetric signing key for HMAC-based signature verification.
 * This is used to embed a verifiable token within the PDF metadata.
 * C3 fix: removed fallback default secret; it's now validated at server startup.
 */
export function generateHmacSignature(
  documentId: string,
  userId: string,
  timestamp: string,
): string {
  const secret = process.env["SIGNING_SECRET"];
  const data = `${documentId}|${userId}|${timestamp}`;
  return crypto.createHmac("sha256", secret!).update(data).digest("hex");
}

/**
 * Verify an HMAC signature embedded in a PDF.
 */
export function verifyHmacSignature(
  documentId: string,
  userId: string,
  timestamp: string,
  signatureToVerify: string,
): boolean {
  const expected = generateHmacSignature(documentId, userId, timestamp);
  // Use timing-safe comparison
  if (expected.length !== signatureToVerify.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureToVerify));
}

// ── PDF Stamping ─────────────────────────────────────────────────────────────

/**
 * Overlay an electronic signature stamp onto a PDF document.
 * This creates a visible signature block on the last page of the PDF
 * and embeds metadata for verification.
 */
export async function stampPdfWithSignature(
  pdfBuffer: Buffer,
  signature: SignaturePayload,
  signatureHash: string,
  hmacToken: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  // Embed a standard font
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Get the last page to stamp the signature block
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  if (!lastPage) {
    throw new Error("PDF document has no pages");
  }
  const { width } = lastPage.getSize();

  // Timestamp
  const now = new Date();
  const formattedDate = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  // Draw signature block in the bottom-right corner
  const margin = 50;
  const blockWidth = 300;
  const blockHeight = 120;
  const x = width - margin - blockWidth;
  const y = margin;

  // Draw a subtle border
  lastPage.drawRectangle({
    x,
    y,
    width: blockWidth,
    height: blockHeight,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 1,
    color: rgb(0.95, 0.95, 0.97),
  });

  // Draw header
  lastPage.drawText(SIGNATURE_STAMP_TEXT, {
    x: x + 10,
    y: y + blockHeight - 20,
    size: 9,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Draw signer name
  lastPage.drawText(signature.signerName, {
    x: x + 10,
    y: y + blockHeight - 38,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Draw signer role
  lastPage.drawText(`Role: ${signature.signerRole}`, {
    x: x + 10,
    y: y + blockHeight - 55,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Draw date
  lastPage.drawText(`Date: ${formattedDate}`, {
    x: x + 10,
    y: y + blockHeight - 70,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Draw signature hash (truncated for display)
  lastPage.drawText(`ID: ${signatureHash.substring(0, 20)}...`, {
    x: x + 10,
    y: y + blockHeight - 85,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Draw HMAC token (truncated for display)
  lastPage.drawText(`Token: ${hmacToken.substring(0, 16)}...`, {
    x: x + 10,
    y: y + blockHeight - 98,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Embed the signature metadata in the PDF's document info dictionary
  pdfDoc.setTitle(`Signed Document - ${signature.documentId}`);
  pdfDoc.setAuthor(signature.signerName);
  pdfDoc.setSubject(`Electronic Signature - ${signature.signerRole}`);
  pdfDoc.setKeywords([
    "electronic-signature",
    `hash-${signatureHash}`,
    `hmac-${hmacToken}`,
  ]);

  // Add creation date if not set
  if (!pdfDoc.getCreationDate()) {
    pdfDoc.setCreationDate(now);
  }

  pdfDoc.setModificationDate(now);

  return Buffer.from(await pdfDoc.save());
}

/**
 * Sign a document by loading it from storage, stamping it, and re-uploading.
 */
export async function signDocument(
  storageKey: string,
  signature: SignaturePayload,
): Promise<SignatureResult> {
  // Load the original PDF from storage
  const pdfBuffer = await getFileBuffer(storageKey);
  if (!pdfBuffer) {
    throw new Error("Document file not found in storage");
  }

  const timestamp = new Date().toISOString();

  // Generate cryptographic signature identifiers
  const signatureHash = generateSignatureHash({
    documentId: signature.documentId,
    userId: signature.userId,
    signerName: signature.signerName,
    signerRole: signature.signerRole,
    timestamp,
  });

  const hmacToken = generateHmacSignature(
    signature.documentId,
    signature.userId,
    timestamp,
  );

  // Stamp the PDF with the signature block
  const signedPdfBuffer = await stampPdfWithSignature(
    pdfBuffer,
    signature,
    signatureHash,
    hmacToken,
  );

  // Upload the signed version back to storage with a new key
  const signedKey = storageKey.replace(/\.pdf$/i, `_signed_${Date.now()}.pdf`);
  const uploadResult = await uploadFile(signedKey, signedPdfBuffer, "application/pdf");

  return {
    signatureHash,
    signedAt: timestamp,
    filePath: uploadResult.key,
  };
}

/**
 * Verify a document has a valid embedded signature block.
 * This checks that the stamped HMAC matches a freshly computed one.
 */
export async function verifyDocumentSignature(
  documentId: string,
  userId: string,
  signedAt: string,
  hmacToken: string,
): Promise<boolean> {
  return verifyHmacSignature(documentId, userId, signedAt, hmacToken);
}