import path from 'node:path';
import os from 'node:os';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/trace?schema=public',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  aiProvider: (process.env.AI_PROVIDER || 'openai') as 'openai' | 'anthropic',
  storagePath: process.env.STORAGE_PATH || path.join(os.homedir(), '.trace', 'storage'),
};
