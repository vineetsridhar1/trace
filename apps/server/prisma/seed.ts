import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Well-known AI user identity — must match apps/server/src/lib/ai-user.ts */
const TRACE_AI_USER_ID = "00000000-0000-4000-a000-000000000001";
const TRACE_AI_EMAIL = "ai@trace.dev";
const TRACE_AI_NAME = "Trace AI";

async function ensureAiUser() {
  const existing = await prisma.user.findUnique({ where: { id: TRACE_AI_USER_ID } });
  if (existing) {
    console.log(`AI user already exists: "${existing.name}" (${existing.id})`);
    return existing;
  }

  const user = await prisma.user.create({
    data: {
      id: TRACE_AI_USER_ID,
      email: TRACE_AI_EMAIL,
      name: TRACE_AI_NAME,
    },
  });
  console.log(`Created AI user: "${user.name}" (${user.id})`);
  return user;
}

async function ensureAiOrgMember(orgId: string) {
  const existing = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId: TRACE_AI_USER_ID, organizationId: orgId } },
  });
  if (existing) return;

  await prisma.orgMember.create({
    data: {
      userId: TRACE_AI_USER_ID,
      organizationId: orgId,
      role: "member",
    },
  });
  console.log(`Added AI user to org ${orgId}`);
}

async function main() {
  // Always ensure the AI user exists
  await ensureAiUser();

  let org = await prisma.organization.findFirst();
  if (org) {
    console.log(`Organization already exists: "${org.name}" (${org.id})`);
  } else {
    org = await prisma.organization.create({
      data: { name: "Trace" },
    });
    console.log(`Created organization: "${org.name}" (${org.id})`);
  }

  // Ensure AI is a member of every org
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  for (const o of orgs) {
    await ensureAiOrgMember(o.id);
  }

  // Ensure AI is a member of every channel
  const channels = await prisma.channel.findMany({ select: { id: true, name: true } });
  for (const ch of channels) {
    const existing = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: ch.id, userId: TRACE_AI_USER_ID } },
    });
    if (!existing) {
      await prisma.channelMember.create({
        data: { channelId: ch.id, userId: TRACE_AI_USER_ID },
      });
      console.log(`Added AI user to channel "${ch.name}" (${ch.id})`);
    } else {
      console.log(`AI user already in channel "${ch.name}"`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
