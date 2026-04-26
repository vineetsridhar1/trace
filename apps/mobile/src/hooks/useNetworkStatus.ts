import { useEffect, useState } from "react";
import NetInfo, { NetInfoStateType, type NetInfoStateType as NetInfoStateTypeValue } from "@react-native-community/netinfo";

interface NetworkStatus {
  isResolved: boolean;
  isConnected: boolean;
  type: NetInfoStateTypeValue;
}

const DEFAULT_STATUS: NetworkStatus = {
  isResolved: false,
  isConnected: false,
  type: NetInfoStateType.unknown,
};

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(DEFAULT_STATUS);

  useEffect(() => {
    void NetInfo.fetch().then((state) => {
      setStatus({
        isResolved: true,
        isConnected: state.isConnected !== false && state.isInternetReachable !== false,
        type: state.type,
      });
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      setStatus({
        isResolved: true,
        isConnected: state.isConnected !== false && state.isInternetReachable !== false,
        type: state.type,
      });
    });
    return unsubscribe;
  }, []);

  return status;
}
