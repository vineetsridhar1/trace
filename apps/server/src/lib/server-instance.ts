import { randomUUID } from "crypto";

const fallbackInstanceId = `${process.pid}:${randomUUID()}`;

export const serverInstanceId =
  process.env.TRACE_SERVER_INSTANCE_ID?.trim() ||
  process.env.POD_NAME?.trim() ||
  process.env.HOSTNAME?.trim() ||
  process.env.FLY_MACHINE_ID?.trim() ||
  fallbackInstanceId;
