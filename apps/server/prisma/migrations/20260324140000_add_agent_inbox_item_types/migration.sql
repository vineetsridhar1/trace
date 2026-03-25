-- Add agent-related inbox item types for escalation and suggestion delivery
ALTER TYPE "InboxItemType" ADD VALUE 'agent_escalation';
ALTER TYPE "InboxItemType" ADD VALUE 'agent_suggestion';
