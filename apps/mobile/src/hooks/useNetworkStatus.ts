import { useEffect, useState } from "react";
import NetInfo, { NetInfoStateType, type NetInfoStateType as NetInfoStateTypeValue } from "@react-native-community/netinfo";

interface NetworkStatus {
  isConnected: boolean;
  type: NetInfoStateTypeValue;
}

const DEFAULT_STATUS: NetworkStatus = {
  isConnected: true,
  type: NetInfoStateType.unknown,
};

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(DEFAULT_STATUS);

  useEffect(() => {
    void NetInfo.fetch().then((state) => {
      setStatus({
        isConnected: state.isConnected !== false && state.isInternetReachable !== false,
        type: state.type,
      });
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      setStatus({
        isConnected: state.isConnected !== false && state.isInternetReachable !== false,
        type: state.type,
      });
    });
    return unsubscribe;
  }, []);

  return status;
}
