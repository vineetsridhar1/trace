import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.organization.findFirst();
  if (existing) {
    console.log(`Organization already exists: "${existing.name}" (${existing.id})`);
    return;
  }

  const org = await prisma.organization.create({
    data: {
      name: "Trace",
    },
  });

  console.log(`Created organization: "${org.name}" (${org.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
