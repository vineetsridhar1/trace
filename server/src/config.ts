export const config = {
  port: parseInt(process.env.PORT || '3100', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/trace?schema=public',
};
