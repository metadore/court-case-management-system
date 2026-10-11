// NOTE: We intentionally avoid importing Prisma generated types here.
// @prisma/client may not be resolvable at TS-time in this workspace.
export type AuditEntityType =
  | "CASE"
  | "HEARING"
  | "HEARING_RECORDING"
  | "DOCUMENT"
  | "PARTY"
  | "PAYMENT"
  | "NOTIFICATION"
  | "USER";

export type AuditAction = string;

export type AuditLogActor = {
  id: string;
  role: string;
};

export type RecordAuditLogParams = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: { auditLog: { create: (args: any) => Promise<unknown> } };
  actor: AuditLogActor;
  courtId: string | null;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  fromState?: string | null;
  toState?: string | null;
  changes?: unknown;
  requestId?: string | null;
};

export async function recordAuditLog(params: RecordAuditLogParams) {
  const {
    prisma,
    actor,
    courtId,
    entityType,
    entityId,
    action,
    fromState,
    toState,
    changes,
    requestId,
  } = params;

  return prisma.auditLog.create({
    data: {
      actorUserId: actor.id,
      actorRole: actor.role,
      courtId,
      entityType,
      entityId,
      action,
      fromState: fromState ?? null,
      toState: toState ?? null,
      changes: (changes ?? null) as unknown as any,

      requestId: requestId ?? null,
    },

  });
}

