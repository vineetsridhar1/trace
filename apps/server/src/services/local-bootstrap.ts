import { prisma } from "../lib/db.js";
import { TRACE_AI_EMAIL, TRACE_AI_NAME, TRACE_AI_USER_ID } from "../lib/ai-user.js";

const LOCAL_ORG_NAME = "Trace";
const LOCAL_CHANNEL_NAME = "General";
const LOCAL_EMAIL_DOMAIN = "trace.local";

function slugifyLocalName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "user";
}

export function normalizeLocalLoginName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 80);
}

function localEmailForName(name: string): string {
  return `${slugifyLocalName(name)}@${LOCAL_EMAIL_DOMAIN}`;
}

export async function findMostRecentLocalUserWorkspace(): Promise<{
  organizationId: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
} | null> {
  const localUser = await prisma.user.findFirst({
    where: {
      email: {
        endsWith: `@${LOCAL_EMAIL_DOMAIN}`,
      },
    },
    orderBy: { updatedAt: "desc" },
    select: { name: true },
  });

  if (!localUser) return null;
  return ensureLocalUserWorkspace(localUser.name);
}

export async function ensureLocalUserWorkspace(name: string): Promise<{
  organizationId: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
}> {
  const normalizedName = normalizeLocalLoginName(name);
  const email = localEmailForName(normalizedName);

  await prisma.user.upsert({
    where: { id: TRACE_AI_USER_ID },
    update: {
      email: TRACE_AI_EMAIL,
      name: TRACE_AI_NAME,
      avatarUrl: null,
      githubId: null,
    },
    create: {
      id: TRACE_AI_USER_ID,
      email: TRACE_AI_EMAIL,
      name: TRACE_AI_NAME,
    },
  });

  let organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (!organization) {
    organization = await prisma.organization.create({
      data: { name: LOCAL_ORG_NAME },
      select: { id: true, name: true },
    });
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: normalizedName,
      githubId: null,
    },
    create: {
      email,
      name: normalizedName,
    },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
    },
  });

  await prisma.orgMember.upsert({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: organization.id,
      },
    },
    update: { role: "admin" },
    create: {
      userId: user.id,
      organizationId: organization.id,
      role: "admin",
    },
  });

  await prisma.orgMember.upsert({
    where: {
      userId_organizationId: {
        userId: TRACE_AI_USER_ID,
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      userId: TRACE_AI_USER_ID,
      organizationId: organization.id,
      role: "member",
    },
  });

  const existingChannel = await prisma.channel.findFirst({
    where: { organizationId: organization.id },
    select: { id: true },
  });

  if (!existingChannel) {
    await prisma.channel.create({
      data: {
        name: LOCAL_CHANNEL_NAME,
        organizationId: organization.id,
        type: "coding",
      },
    });
  }

  return {
    organizationId: organization.id,
    user,
  };
}
