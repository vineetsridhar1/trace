import { createHash, randomBytes } from "crypto";
import type { PushPlatform } from "@prisma/client";
import { prisma } from "../lib/db.js";

const PAIRING_TOKEN_TTL_MS = 5 * 60 * 1000;
const SECRET_BYTES = 32;

export class LocalMobileAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "LocalMobileAuthError";
  }
}

export type LocalMobileAuthSubject = {
  kind: "local_mobile";
  userId: string;
  organizationId: string;
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

export function hashLocalMobileSecret(secret: string): string {
  return hashSecret(secret);
}

export async function createLocalMobilePairingToken(input: {
  ownerUserId: string;
  organizationId: string;
}): Promise<{ pairingToken: string; expiresAt: Date }> {
  const { secret, secretHash } = createSecret();
  const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS);

  await prisma.localMobilePairingToken.create({
    data: {
      ownerUserId: input.ownerUserId,
      organizationId: input.organizationId,
      tokenHash: secretHash,
      expiresAt,
    },
  });

  return { pairingToken: secret, expiresAt };
}

export async function pairLocalMobileDevice(input: {
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
    throw new LocalMobileAuthError("Pairing token is required");
  }

  const installId = input.installId.trim();
  if (installId.length < 8) {
    throw new LocalMobileAuthError("installId is required");
  }

  const tokenHash = hashSecret(pairingToken);
  const now = new Date();

  const pairingRecord = await prisma.localMobilePairingToken.findUnique({
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
    throw new LocalMobileAuthError("Pairing code is invalid or expired", 401);
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.localMobilePairingToken.findUnique({
      where: { id: pairingRecord.id },
      select: {
        id: true,
        ownerUserId: true,
        organizationId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!current || current.usedAt || current.expiresAt <= now) {
      throw new LocalMobileAuthError("Pairing code is invalid or expired", 401);
    }

    const { secret, secretHash } = createSecret();
    const device = await tx.localMobileDevice.upsert({
      where: {
        ownerUserId_organizationId_installId: {
          ownerUserId: current.ownerUserId,
          organizationId: current.organizationId,
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
        ownerUserId: current.ownerUserId,
        organizationId: current.organizationId,
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

    await tx.localMobilePairingToken.update({
      where: { id: current.id },
      data: { usedAt: now },
    });

    return {
      token: secret,
      deviceId: device.id,
      organizationId: current.organizationId,
    };
  });
}

export async function authenticateLocalMobileSecret(
  secret: string,
): Promise<LocalMobileAuthSubject | null> {
  const trimmed = secret.trim();
  if (!trimmed) return null;

  const tokenHash = hashSecret(trimmed);
  const device = await prisma.localMobileDevice.findUnique({
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

  await prisma.localMobileDevice.updateMany({
    where: { id: device.id, revokedAt: null },
    data: { lastSeenAt: new Date() },
  });

  return {
    kind: "local_mobile",
    userId: device.ownerUserId,
    organizationId: device.organizationId,
    deviceId: device.id,
  };
}

export async function listLocalMobileDevices(input: {
  ownerUserId: string;
  organizationId: string;
}) {
  return prisma.localMobileDevice.findMany({
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

export async function revokeLocalMobileDevice(input: {
  ownerUserId: string;
  organizationId: string;
  deviceId: string;
}): Promise<void> {
  const result = await prisma.localMobileDevice.updateMany({
    where: {
      id: input.deviceId,
      ownerUserId: input.ownerUserId,
      organizationId: input.organizationId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    throw new LocalMobileAuthError("Paired device not found", 404);
  }
}

export async function revokeLocalMobileDeviceByToken(secret: string): Promise<void> {
  const trimmed = secret.trim();
  if (!trimmed) return;

  await prisma.localMobileDevice.updateMany({
    where: {
      tokenHash: hashSecret(trimmed),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}
