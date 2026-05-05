import { createHash, randomBytes } from "crypto";
import type { PushPlatform } from "@prisma/client";
import { prisma } from "../lib/db.js";

const PAIRING_TOKEN_TTL_MS = 5 * 60 * 1000;
const SECRET_BYTES = 32;

export class MobileAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "MobileAuthError";
  }
}

export type MobileAuthSubject = {
  kind: "mobile";
  userId: string;
  pairedOrganizationId: string;
  deviceId: string;
};

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function createSecret(): { secret: string; secretHash: string } {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return { secret, secretHash: hashSecret(secret) };
}

function sanitizeDeviceName(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 120) : null;
}

function sanitizeAppVersion(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 40) : null;
}

export function hashMobileSecret(secret: string): string {
  return hashSecret(secret);
}

export async function createMobilePairingToken(input: {
  ownerUserId: string;
  organizationId: string;
}): Promise<{ pairingToken: string; expiresAt: Date }> {
  const { secret, secretHash } = createSecret();
  const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS);

  await prisma.mobilePairingToken.create({
    data: {
      ownerUserId: input.ownerUserId,
      organizationId: input.organizationId,
      tokenHash: secretHash,
      expiresAt,
    },
  });

  return { pairingToken: secret, expiresAt };
}

export async function pairMobileDevice(input: {
  pairingToken: string;
  installId: string;
  deviceName?: string;
  platform?: PushPlatform | null;
  appVersion?: string;
}): Promise<{
  token: string;
  deviceId: string;
  organizationId: string;
}> {
  const pairingToken = input.pairingToken.trim();
  if (!pairingToken) {
    throw new MobileAuthError("Pairing token is required");
  }

  const installId = input.installId.trim();
  if (installId.length < 8) {
    throw new MobileAuthError("installId is required");
  }

  const tokenHash = hashSecret(pairingToken);
  const now = new Date();

  const pairingRecord = await prisma.mobilePairingToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      ownerUserId: true,
      organizationId: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!pairingRecord || pairingRecord.usedAt || pairingRecord.expiresAt <= now) {
    throw new MobileAuthError("Pairing code is invalid or expired", 401);
  }

  return prisma.$transaction(async (tx) => {
    const claim = await tx.mobilePairingToken.updateMany({
      where: {
        id: pairingRecord.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (claim.count !== 1) {
      throw new MobileAuthError("Pairing code is invalid or expired", 401);
    }

    const { secret, secretHash } = createSecret();
    const device = await tx.mobileDevice.upsert({
      where: {
        ownerUserId_organizationId_installId: {
          ownerUserId: pairingRecord.ownerUserId,
          organizationId: pairingRecord.organizationId,
          installId,
        },
      },
      update: {
        deviceName: sanitizeDeviceName(input.deviceName),
        platform: input.platform ?? null,
        appVersion: sanitizeAppVersion(input.appVersion),
        tokenHash: secretHash,
        revokedAt: null,
        lastSeenAt: now,
      },
      create: {
        ownerUserId: pairingRecord.ownerUserId,
        organizationId: pairingRecord.organizationId,
        installId,
        deviceName: sanitizeDeviceName(input.deviceName),
        platform: input.platform ?? null,
        appVersion: sanitizeAppVersion(input.appVersion),
        tokenHash: secretHash,
        lastSeenAt: now,
      },
      select: {
        id: true,
      },
    });

    return {
      token: secret,
      deviceId: device.id,
      organizationId: pairingRecord.organizationId,
    };
  });
}

export async function authenticateMobileSecret(
  secret: string,
): Promise<MobileAuthSubject | null> {
  const trimmed = secret.trim();
  if (!trimmed) return null;

  const tokenHash = hashSecret(trimmed);
  const device = await prisma.mobileDevice.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      ownerUserId: true,
      organizationId: true,
      revokedAt: true,
    },
  });

  if (!device || device.revokedAt) {
    return null;
  }

  await prisma.mobileDevice.updateMany({
    where: { id: device.id, revokedAt: null },
    data: { lastSeenAt: new Date() },
  });

  return {
    kind: "mobile",
    userId: device.ownerUserId,
    pairedOrganizationId: device.organizationId,
    deviceId: device.id,
  };
}

export async function listMobileDevices(input: {
  ownerUserId: string;
  organizationId: string;
}) {
  return prisma.mobileDevice.findMany({
    where: {
      ownerUserId: input.ownerUserId,
      organizationId: input.organizationId,
      revokedAt: null,
    },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      installId: true,
      deviceName: true,
      platform: true,
      appVersion: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });
}

export async function revokeMobileDevice(input: {
  ownerUserId: string;
  organizationId: string;
  deviceId: string;
}): Promise<void> {
  const result = await prisma.mobileDevice.updateMany({
    where: {
      id: input.deviceId,
      ownerUserId: input.ownerUserId,
      organizationId: input.organizationId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    throw new MobileAuthError("Paired device not found", 404);
  }
}

export async function revokeMobileDeviceByToken(secret: string): Promise<void> {
  const trimmed = secret.trim();
  if (!trimmed) return;

  await prisma.mobileDevice.updateMany({
    where: {
      tokenHash: hashSecret(trimmed),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}
