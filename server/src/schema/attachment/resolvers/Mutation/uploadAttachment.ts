import type { MutationResolvers } from './../../../types.generated';
import { getStorage, generateStorageKey, computeChecksum } from '../../../../services/storageService';
import prisma from '../../../../lib/prisma';

export const uploadAttachment: NonNullable<MutationResolvers['uploadAttachment']> = async (_parent, { data, filename, contentType }, _ctx) => {
  const buffer = Buffer.from(data, 'base64');
  const storage = getStorage();
  const key = generateStorageKey(buffer, filename);
  const checksum = computeChecksum(buffer);

  const existing = await prisma.attachment.findUnique({ where: { key } });
  if (existing) {
    return {
      ...existing,
      url: storage.url(key),
      localPath: storage.localPath(key),
    };
  }

  await storage.store(key, buffer);

  const attachment = await prisma.attachment.create({
    data: {
      key,
      filename,
      contentType,
      byteSize: buffer.length,
      checksum,
    },
  });

  return {
    ...attachment,
    url: storage.url(key),
    localPath: storage.localPath(key),
  };
};
