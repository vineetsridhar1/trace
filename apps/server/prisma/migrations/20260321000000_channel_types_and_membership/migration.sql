-- Add new ChannelType values
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'coding';
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'text';

-- Add new EventType values
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'channel_member_added';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'channel_member_removed';
