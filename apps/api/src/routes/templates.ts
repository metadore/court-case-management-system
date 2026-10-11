import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireTenantScope } from "../middleware/tenantScope.js";
import { z } from "zod";
import { getAllTemplates, getTemplateById, getTemplatesForCaseType, renderTemplate } from "../lib/templates.js";

export default async function templateRoutes(app: FastifyInstance) {
  // ── List all available templates ──────────────────────────────────────
  app.get(
    "/templates",
    { preHandler: [requireAuth] },
    async (_request, reply) => {
      const templates = getAllTemplates().map(({ id, name, description, category, applicableCaseTypes, variables }) => ({
        id,
        name,
        description,
        category,
        applicableCaseTypes,
        variables,
      }));
      return reply.send({ data: templates });
    }
  );

  // ── Get a single template by ID ───────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/templates/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const template = getTemplateById(request.params.id);
      if (!template) return reply.status(404).send({ error: "Template not found" });
      return reply.send({ data: template });
    }
  );

  // ── Get templates applicable to a case type ───────────────────────────
  app.get<{ Querystring: { caseType?: string } }>(
    "/templates/by-case-type",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { caseType } = request.query;
      const templates = caseType
        ? getTemplatesForCaseType(caseType)
        : getAllTemplates();
      return reply.send({
        data: templates.map(({ id, name, description, category, applicableCaseTypes, variables }) => ({
          id, name, description, category, applicableCaseTypes, variables,
        })),
      });
    }
  );

  // ── Preview / render a template with provided variables ───────────────
  const renderSchema = z.object({
    templateId: z.string(),
    variables: z.record(z.string()),
  });

  app.post(
    "/templates/render",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = renderSchema.parse(request.body);
      const template = getTemplateById(body.templateId);
      if (!template) return reply.status(404).send({ error: "Template not found" });

      const rendered = renderTemplate(template, body.variables);
      return reply.send({ data: { content: rendered, templateName: template.name } });
    }
  );

  // ── Generate and save a document from template to a case ─────────────
  const generateSchema = z.object({
    templateId: z.string(),
    variables: z.record(z.string()),
    title: z.string().min(1),
    confidentiality: z.enum(["PUBLIC", "RESTRICTED", "SEALED", "CONFIDENTIAL"]).default("PUBLIC"),
  });

  app.post<{ Params: { caseId: string } }>(
    "/cases/:caseId/documents/from-template",
    { preHandler: [requireAuth, requireTenantScope] },
    async (request, reply) => {
      const body = generateSchema.parse(request.body);
      const { prisma } = await import("@tpt-court/database");

      const caseRecord = await prisma.case.findUnique({
        where: { id: request.params.caseId },
        select: { id: true, courtId: true },
      });
      if (!caseRecord) return reply.status(404).send({ error: "Case not found" });

      const template = getTemplateById(body.templateId);
      if (!template) return reply.status(404).send({ error: "Template not found" });

      const rendered = renderTemplate(template, body.variables);

      // Determine document type from template category
      const typeMap: Record<string, string> = {
        ORDER: "ORDER",
        JUDGMENT: "JUDGMENT",
        NOTICE: "NOTICE",
        MOTION: "MOTION",
        SUMMONS: "NOTICE",
        OTHER: "OTHER",
      };
      const docType = typeMap[template.category] ?? "OTHER";

      // Save rendered text as a plain text file
      const { uploadFile } = await import("../lib/storage.js");
      const key = `cases/${caseRecord.id}/templates/${Date.now()}-${template.id}.txt`;
      const buffer = Buffer.from(rendered, "utf-8");
      await uploadFile(key, buffer, "text/plain");

      const doc = await prisma.document.create({
        data: {
          caseId: caseRecord.id,
          uploadedById: request.user.id,
          title: body.title,
          type: docType as any,
          filePath: key,
          fileSize: buffer.byteLength,
          mimeType: "text/plain",
          confidentiality: body.confidentiality as any,
          version: 1,
        },
      });

      return reply.status(201).send({ data: doc });
    }
  );
}
