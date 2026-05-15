/**
 * Verifies duplicate prevention via orchestrator (run once per DB).
 * Usage: npx tsx scripts/phase2-duplicate-test.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  DuplicateCommunicationError,
  orchestratorService,
} from "../src/services/orchestrator.service";

const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.findFirst({ where: { mrn: "MRN-10001" } });
  if (!client) throw new Error("Seed client MRN-10001 not found");

  const purpose = `audit_dup_test_${Date.now()}`;

  const staffCtx = { source: "staff" as const };

  await orchestratorService.sendSms(
    {
      clientId: client.id,
      purpose,
      messageBody: "Duplicate test message",
    },
    staffCtx
  );

  try {
    await orchestratorService.sendSms(
      {
        clientId: client.id,
        purpose,
        messageBody: "Should be blocked",
      },
      staffCtx
    );
    console.error("FAIL: duplicate SMS was allowed");
    process.exit(1);
  } catch (e) {
    if (e instanceof DuplicateCommunicationError) {
      console.log("OK: duplicate blocked", e.existingId);
    } else throw e;
  }

  const log = await prisma.smsLog.findFirst({
    where: { clientId: client.id, purpose },
    include: { client: true },
  });
  const timeline = await prisma.clientTimelineEvent.count({
    where: { clientId: client.id, title: { contains: purpose } },
  });
  const audit = await prisma.auditLog.count({
    where: { entityType: "SmsLog", clientId: client.id, metadata: { path: ["purpose"], equals: purpose } },
  });

  console.log(
    JSON.stringify({
      smsCreated: !!log,
      hasClient: !!log?.client,
      timelineEventsForPurpose: timeline,
      auditNote: "check audit via entityId",
    })
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
