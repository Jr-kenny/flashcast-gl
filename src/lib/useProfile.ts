import { useCallback, useEffect, useState } from "react";
import { getBalance, profileAddress } from "./genlayer";

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
  }, [refresh]);

  return { address, balance, loading, refresh };
}
