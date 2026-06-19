import { useCallback, useEffect, useState } from "react";
import { getBalance, IDENTITY_CHANGED, profileAddress } from "./genlayer";

export function useProfile() {
  const [address, setAddress] = useState<string>("");
  const [balance, setBalance] = useState<string>("0");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setAddress(profileAddress());
      setBalance(await getBalance());
    } catch {
      /* not configured yet */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(IDENTITY_CHANGED, refresh);
    return () => window.removeEventListener(IDENTITY_CHANGED, refresh);
  }, [refresh]);

  return { address, balance, loading, refresh };
}
