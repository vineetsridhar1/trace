import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  let server = await prisma.server.findFirst({ where: { name: 'Trace' } });
  if (!server) {
    server = await prisma.server.create({ data: { name: 'Trace' } });
    console.log('Created "Trace" server');
  } else {
    console.log('"Trace" server already exists');
  }

  const existing = await prisma.channel.findFirst({ where: { name: 'general' } });
  if (!existing) {
    await prisma.channel.create({ data: { name: 'general', serverId: server.id } });
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
