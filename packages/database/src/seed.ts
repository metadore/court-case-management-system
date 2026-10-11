import { PrismaClient, UserRole, CaseType, CaseStatus, HearingType, HearingStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const court = await prisma.court.upsert({
    where: { code: "MAIN" },
    update: {},
    create: {
      name: "Central District Court",
      code: "MAIN",
      address: "1 Justice Way, Capital City",
      email: "registry@court.example",
      phone: "+1-555-0100",
    },
  });

  const [adminHash, judgeHash, clerkHash, lawyerHash] = await Promise.all([
    bcrypt.hash("Admin1234!", 12),
    bcrypt.hash("Judge1234!", 12),
    bcrypt.hash("Clerk1234!", 12),
    bcrypt.hash("Lawyer1234!", 12),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: "admin@court.example" },
    update: { passwordHash: adminHash },
    create: {
      courtId: court.id,
      email: "admin@court.example",
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      firstName: "System",
      lastName: "Administrator",
    },
  });

  const judge = await prisma.user.upsert({
    where: { email: "judge@court.example" },
    update: { passwordHash: judgeHash },
    create: {
      courtId: court.id,
      email: "judge@court.example",
      passwordHash: judgeHash,
      role: UserRole.JUDGE,
      firstName: "Honourable",
      lastName: "Justice Smith",
    },
  });

  const clerk = await prisma.user.upsert({
    where: { email: "clerk@court.example" },
    update: { passwordHash: clerkHash },
    create: {
      courtId: court.id,
      email: "clerk@court.example",
      passwordHash: clerkHash,
      role: UserRole.CLERK,
      firstName: "Registry",
      lastName: "Clerk",
    },
  });

  const lawyer = await prisma.user.upsert({
    where: { email: "lawyer@court.example" },
    update: { passwordHash: lawyerHash },
    create: {
      email: "lawyer@court.example",
      passwordHash: lawyerHash,
      role: UserRole.LAWYER,
      firstName: "Jane",
      lastName: "Doe",
      barNumber: "BAR-2024-001",
    },
  });

  const courtroom = await prisma.courtroom.upsert({
    where: { id: "courtroom-1" },
    update: {},
    create: {
      id: "courtroom-1",
      courtId: court.id,
      name: "Courtroom 1",
      capacity: 50,
    },
  });

  const demoCase = await prisma.case.upsert({
    where: { caseNumber: "MAIN-2025-00001" },
    update: {},
    create: {
      courtId: court.id,
      caseNumber: "MAIN-2025-00001",
      title: "Smith v. Jones",
      type: CaseType.CIVIL,
      status: CaseStatus.ACTIVE,
      description: "Breach of contract dispute",
      assignedJudgeId: judge.id,
      createdById: clerk.id,
      isPublic: true,
    },
  });

  await prisma.party.createMany({
    skipDuplicates: true,
    data: [
      {
        caseId: demoCase.id,
        userId: lawyer.id,
        name: "Jane Doe (Counsel)",
        role: "COUNSEL_PLAINTIFF",
        email: lawyer.email,
      },
      {
        caseId: demoCase.id,
        name: "Robert Smith",
        role: "PLAINTIFF",
        email: "rsmith@example.com",
      },
      {
        caseId: demoCase.id,
        name: "Michael Jones",
        role: "DEFENDANT",
        email: "mjones@example.com",
      },
    ],
  });

  await prisma.hearing.create({
    data: {
      caseId: demoCase.id,
      judgeId: judge.id,
      courtroomId: courtroom.id,
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      type: HearingType.STATUS_CONFERENCE,
      status: HearingStatus.SCHEDULED,
      durationMins: 30,
    },
  });

  console.log("Seed complete.");
  console.log("\nDemo credentials (change in production):");
  console.log("  Admin:  admin@court.example  / Admin1234!");
  console.log("  Judge:  judge@court.example  / Judge1234!");
  console.log("  Clerk:  clerk@court.example  / Clerk1234!");
  console.log("  Lawyer: lawyer@court.example / Lawyer1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
