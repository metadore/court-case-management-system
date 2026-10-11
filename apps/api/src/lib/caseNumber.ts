import { prisma } from "./prisma.js";

export async function generateCaseNumber(courtCode: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${courtCode}-${year}`;

  const latest = await prisma.case.findFirst({
    where: { caseNumber: { startsWith: prefix } },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });

  let seq = 1;
  if (latest) {
    const parts = latest.caseNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1] ?? "0", 10);
    seq = lastSeq + 1;
  }

  return `${prefix}-${String(seq).padStart(5, "0")}`;
}
