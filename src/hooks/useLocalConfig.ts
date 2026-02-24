import { useState, useCallback, useEffect } from 'react';
import type { LocalChannelConfig } from '../types';

export function useLocalConfig() {
  const [configs, setConfigs] = useState<Record<string, LocalChannelConfig>>({});

  useEffect(() => {
    void window.traceAPI.getAllLocalConfigs().then((all) => {
      setConfigs(all ?? {});
    });
  }, []);

  const getConfig = useCallback(
    (channelId: string): LocalChannelConfig | null => {
      return configs[channelId] ?? null;
    },
    [configs],
  );

  const setConfig = useCallback(
    async (channelId: string, data: LocalChannelConfig) => {
      await window.traceAPI.setLocalConfig(channelId, data);
      setConfigs((prev) => ({ ...prev, [channelId]: data }));
    },
    [],
  );

  const deleteConfig = useCallback(async (channelId: string) => {
    await window.traceAPI.deleteLocalConfig(channelId);
    setConfigs((prev) => {
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
  }, []);

  const refreshConfigs = useCallback(async () => {
    const all = await window.traceAPI.getAllLocalConfigs();
    setConfigs(all ?? {});
  }, []);

  return { configs, getConfig, setConfig, deleteConfig, refreshConfigs };
}
