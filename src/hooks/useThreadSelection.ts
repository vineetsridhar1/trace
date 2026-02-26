import { useCallback, useRef, useState } from 'react';
import type { ChannelMessage } from '../types';

export function useThreadSelection() {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChannelMessage | null>(null);
  const selectedMessageRef = useRef<ChannelMessage | null>(null);
  const selectedMessageIdRef = useRef<string | null>(null);

  selectedMessageRef.current = selectedMessage;
  selectedMessageIdRef.current = selectedMessageId;

  const syncSelectedMessage = useCallback((message: ChannelMessage) => {
    setSelectedMessage((current) => {
      if (current && current.id === message.id) return message;
      return current;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedMessageId(null);
    setSelectedMessage(null);
  }, []);

  const selectMessage = useCallback((message: ChannelMessage) => {
    setSelectedMessageId(message.id);
    setSelectedMessage(message);
  }, []);

  return {
    selectedMessageId,
    selectedMessage,
    selectedMessageRef,
    selectedMessageIdRef,
    syncSelectedMessage,
    clearSelection,
    selectMessage,
  };
}
