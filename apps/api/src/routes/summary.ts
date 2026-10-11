import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import Anthropic from "@anthropic-ai/sdk";

// ── Provider abstraction ──────────────────────────────────────────────────────

const AI_PROVIDER = process.env["AI_PROVIDER"] ?? "anthropic"; // "anthropic" | "local"
// Local: Ollama-compatible base URL, e.g. http://localhost:11434
const LOCAL_AI_URL = process.env["LOCAL_AI_URL"] ?? "http://localhost:11434";
const LOCAL_AI_MODEL = process.env["LOCAL_AI_MODEL"] ?? "llama3";

async function callAnthropic(prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content[0]?.type === "text" ? message.content[0].text : "";
}

async function callLocalAI(prompt: string): Promise<string> {
  // Ollama chat completions API (OpenAI-compatible endpoint)
  const res = await fetch(`${LOCAL_AI_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LOCAL_AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Local AI error ${res.status}: ${await res.text()}`);
  const json = await res.json() as { message?: { content?: string } };
  return json.message?.content ?? "";
}

async function generateSummary(prompt: string): Promise<string> {
  if (AI_PROVIDER === "local") return callLocalAI(prompt);
  return callAnthropic(prompt);
}

function isConfigured(): boolean {
  if (AI_PROVIDER === "local") return true; // local is always "configured"
  return Boolean(process.env["ANTHROPIC_API_KEY"]);
}

/**
 * Sanitize case data to prevent prompt injection (M4 fix).
 * Escapes or removes control characters and known prompt injection patterns.
 */
function sanitizeForPrompt(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\0/g, "") // Remove null bytes
    .replace(/[<>]/g, "") // Remove angle brackets that might be interpreted as instructions
    .replace(/```/g, "") // Remove markdown code fences
    .replace(/\${.*?}/g, "") // Remove template literal expressions
    .replace(/\\/g, "\\\\") // Escape backslashes
    .replace(/"/g, '\\"') // Escape double quotes
    .substring(0, 5000); // Limit length
}

// ── Route ─────────────────────────────────────────────────────────────────────

export default async function summaryRoutes(app: FastifyInstance) {
  // GET /api/cases/:id/summary — AI-generated plain-English case briefing
  app.get<{ Params: { id: string } }>("/cases/:id/summary", { preHandler: [requireAuth, requireTenantScope] }, async (request, reply) => {
    if (!isConfigured()) {
      return reply.status(503).send({
        error: "NOT_CONFIGURED",
        message: "AI summarization is not configured. Set ANTHROPIC_API_KEY or AI_PROVIDER=local + LOCAL_AI_URL.",
        statusCode: 503,
      });
    }

    const caseRecord = await prisma.case.findUnique({
      where: { id: request.params.id },
      include: {
        assignedJudge: { select: { firstName: true, lastName: true } },
        parties: { select: { name: true, role: true } },
        hearings: {
          select: { type: true, status: true, scheduledAt: true, durationMins: true, notes: true },
          orderBy: { scheduledAt: "asc" },
        },
        documents: {
          select: { title: true, type: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!caseRecord) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Case not found", statusCode: 404 });
    }

    // C1 fix: enforce tenant scoping
    const userCourtId = request.user.courtId;
    if (userCourtId && caseRecord.courtId !== userCourtId) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Access denied: case belongs to a different court", statusCode: 403 });
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId: caseRecord.id, entityType: "CASE" },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { action: true, fromState: true, toState: true, actorRole: true, createdAt: true },
    });

    // M4 fix: Sanitize all user-provided data before passing to the LLM
    const sanitizedCaseNumber = sanitizeForPrompt(caseRecord.caseNumber);
    const sanitizedTitle = sanitizeForPrompt(caseRecord.title);
    const sanitizedDescription = sanitizeForPrompt(caseRecord.description);
    const sanitizedJudgeName = caseRecord.assignedJudge
      ? `${sanitizeForPrompt(caseRecord.assignedJudge.firstName)} ${sanitizeForPrompt(caseRecord.assignedJudge.lastName)}`
      : "Unassigned";

    const partiesText = caseRecord.parties
      .map((p) => `- ${sanitizeForPrompt(p.name)} (${sanitizeForPrompt(p.role)})`)
      .join("\n") || "None recorded";

    const hearingsText = caseRecord.hearings
      .map((h) => `- ${sanitizeForPrompt(h.type)} on ${sanitizeForPrompt(h.scheduledAt.toISOString().split("T")[0])}, ${h.durationMins} min, status: ${sanitizeForPrompt(h.status)}${h.notes ? ` — ${sanitizeForPrompt(h.notes)}` : ""}`)
      .join("\n") || "None scheduled";

    const documentsText = caseRecord.documents
      .map((d) => `- ${sanitizeForPrompt(d.title)} (${sanitizeForPrompt(d.type)}) on ${sanitizeForPrompt(d.createdAt.toISOString().split("T")[0])}`)
      .join("\n") || "None";

    const activityText = auditLogs
      .map((e) => `- ${sanitizeForPrompt(e.createdAt.toISOString().split("T")[0])} [${sanitizeForPrompt(e.actorRole)}] ${sanitizeForPrompt(e.action)}${e.fromState && e.toState ? ` (${sanitizeForPrompt(e.fromState)} → ${sanitizeForPrompt(e.toState)})` : ""}`)
      .join("\n") || "No recorded events";

    const caseContext = `
CASE: ${sanitizedCaseNumber} — ${sanitizedTitle}
Type: ${sanitizeForPrompt(caseRecord.type)}
Status: ${sanitizeForPrompt(caseRecord.status)}
Filed: ${sanitizeForPrompt(caseRecord.filedAt.toISOString().split("T")[0])}
Judge: ${sanitizedJudgeName}

PARTIES (${caseRecord.parties.length}):
${partiesText}

HEARINGS (${caseRecord.hearings.length}):
${hearingsText}

DOCUMENTS FILED (${caseRecord.documents.length}):
${documentsText}

ACTIVITY TIMELINE:
${activityText}
`.trim();

    const prompt = `You are a court clerk assistant. Write a concise, factual plain-English briefing (3-5 sentences) for a judge or lawyer who is new to this case. Summarise the case type, key parties, current status, hearing history, and any notable activity. Do not include legal opinions or advice.\n\n${caseContext}`;

    try {
      const summary = await generateSummary(prompt);
      return reply.send({
        data: {
          summary: summary || "Unable to generate summary.",
          provider: AI_PROVIDER,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      app.log.error(err, "AI summary generation failed");
      return reply.status(502).send({
        error: "AI_ERROR",
        message: err instanceof Error ? err.message : "AI request failed.",
        statusCode: 502,
      });
    }
  });
}