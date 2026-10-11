import type { Server } from "socket.io";
import { prisma } from "@tpt-court/database";

const STAFF_ROLES = new Set(["ADMIN", "JUDGE", "CLERK"]);

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    const socketUser = (socket as any).user as { sub: string; role: string } | undefined;
    const authenticatedUserId = socketUser?.sub ?? "";
    const authenticatedRole = socketUser?.role ?? "";

    // Only allow joining own user room — prevents IDOR notification eavesdropping
    socket.on("join:user", (userId: string) => {
      if (userId === authenticatedUserId) {
        socket.join(`user:${userId}`);
      }
    });

    // Join a case room: staff can join any case; lawyers/public must be a party
    socket.on("join:case", async (caseId: string) => {
      if (typeof caseId !== "string" || !caseId) return;

      if (STAFF_ROLES.has(authenticatedRole)) {
        socket.join(`case:${caseId}`);
        return;
      }

      const hasAccess = await prisma.party.findFirst({
        where: { caseId, userId: authenticatedUserId },
        select: { id: true },
      }).catch(() => null);

      if (hasAccess) {
        socket.join(`case:${caseId}`);
      }
    });

    socket.on("leave:case", (caseId: string) => {
      socket.leave(`case:${caseId}`);
    });

    socket.on("disconnect", () => {
      // rooms cleaned up automatically
    });
  });
}

// Helpers called by route handlers to push events
export function emitToUser(io: Server, userId: string, event: string, data: unknown) {
  io.to(`user:${userId}`).emit(event, data);
}

export function emitToCase(io: Server, caseId: string, event: string, data: unknown) {
  io.to(`case:${caseId}`).emit(event, data);
}
