import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.channel.findFirst({ where: { name: 'general' } });
  if (!existing) {
    await prisma.channel.create({ data: { name: 'general' } });
    console.log('Created "general" channel');
  } else {
    console.log('"general" channel already exists');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
