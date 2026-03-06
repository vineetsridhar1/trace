import { useCallback, useEffect, useRef } from 'react';
import { gql, useMutation, useSubscription, useLazyQuery } from '@apollo/client';
import { useThreadStore } from '../stores/threadStore';
import { usePresenceStore } from '../stores/presenceStore';

const REPORT_PRESENCE = gql`
  mutation ReportPresence($channelId: ID!, $workspaceId: ID) {
    reportPresence(channelId: $channelId, workspaceId: $workspaceId)
  }
`;

const CHANNEL_PRESENCE = gql`
  query ChannelPresence($channelId: ID!) {
    channelPresence(channelId: $channelId) {
      workspaceId
      viewers {
        userId
        name
        avatarUrl
      }
    }
  }
`;

const PRESENCE_UPDATED = gql`
  subscription PresenceUpdated($channelId: ID!) {
    presenceUpdated(channelId: $channelId) {
      channelId
      presence {
        workspaceId
        viewers {
          userId
          name
          avatarUrl
        }
      }
    }
  }
`;

export function usePresenceReporter(channelId: string | null) {
  const [executeReport] = useMutation(REPORT_PRESENCE);
  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;

  const report = useCallback(
    (cId: string, workspaceId: string | null) => {
      void executeReport({
        variables: { channelId: cId, workspaceId },
      });
    },
    [executeReport],
  );

  // Watch selectedWorkspaceId and report changes
  useEffect(() => {
    if (!channelId) return;

    // Report current workspace on mount
    const currentWs = useThreadStore.getState().selectedWorkspaceId;
    if (currentWs) report(channelId, currentWs);

    // Subscribe to workspace selection changes
    let prevWsId = currentWs;
    const unsub = useThreadStore.subscribe((state) => {
      const wsId = state.selectedWorkspaceId;
      if (wsId !== prevWsId) {
        prevWsId = wsId;
        if (channelIdRef.current) {
          report(channelIdRef.current, wsId);
        }
      }
    });

    return () => {
      unsub();
      // Clear presence on unmount
      report(channelId, null);
    };
  }, [channelId, report]);

  // Heartbeat every 30s
  useEffect(() => {
    if (!channelId) return;

    const interval = setInterval(() => {
      const wsId = useThreadStore.getState().selectedWorkspaceId;
      if (channelIdRef.current && wsId) {
        report(channelIdRef.current, wsId);
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [channelId, report]);
}

export function usePresenceSubscription(channelId: string | null) {
  const [fetchPresence] = useLazyQuery(CHANNEL_PRESENCE, {
    fetchPolicy: 'network-only',
  });

  // Fetch initial presence when channel changes
  useEffect(() => {
    if (!channelId) {
      usePresenceStore.getState().clear();
      return;
    }

    void fetchPresence({ variables: { channelId } }).then(({ data }) => {
      if (data?.channelPresence) {
        usePresenceStore.getState().setChannelPresence(data.channelPresence);
      }
    });
  }, [channelId, fetchPresence]);

  // Subscribe to presence updates
  const skip = !channelId;
  const variables = { channelId: channelId ?? '' };

  const { data: presenceData } = useSubscription(PRESENCE_UPDATED, { variables, skip });

  useEffect(() => {
    if (!presenceData?.presenceUpdated) return;
    usePresenceStore.getState().setChannelPresence(presenceData.presenceUpdated.presence);
  }, [presenceData]);
}
