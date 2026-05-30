"use client";

import { useMemo } from "react";
import { erc20Abi } from "viem";
import { useReadContract, useReadContracts } from "wagmi";

import { PythiaAIProviderAbi } from "@/lib/abi/PythiaAIProvider";
import { PythiaHookAbi } from "@/lib/abi/PythiaHook";
import { ADDRESSES } from "@/lib/contracts";

export type MarketSummary = {
  id: bigint;
  question: string;
  expiry: bigint;
  modelId: number;
  storedStatus: number;
  effectiveStatus: number;
  creator: `0x${string}`;
  yesToken: `0x${string}`;
  noToken: `0x${string}`;
  yesIsCurrency0: boolean;
  winningChoice: number;
};

export function useMarketIds(offset = 0, limit = 50) {
  return useReadContract({
    address: ADDRESSES.hook,
    abi: PythiaHookAbi,
    functionName: "getMarkets",
    args: [BigInt(offset), BigInt(limit)],
    query: {
      enabled: ADDRESSES.hook !== "0x0000000000000000000000000000000000000000"
    }
  });
}

export function useMarketSummaries(ids: bigint[] | readonly bigint[] | undefined) {
  const idList = useMemo(() => (ids ? Array.from(ids) : []), [ids]);

  const contracts = useMemo(
    () =>
      idList.flatMap((id) => [
        {
          address: ADDRESSES.hook,
          abi: PythiaHookAbi,
          functionName: "markets" as const,
          args: [id] as const
        },
        {
          address: ADDRESSES.hook,
          abi: PythiaHookAbi,
          functionName: "effectiveStatus" as const,
          args: [id] as const
        }
      ]),
    [idList]
  );

  const query = useReadContracts({
    contracts,
    allowFailure: true,
    query: { enabled: idList.length > 0 }
  });

  const summaries: MarketSummary[] = useMemo(() => {
    const data = query.data ?? [];
    return idList
      .map((id, i): MarketSummary | null => {
        const marketRes = data[i * 2];
        const statusRes = data[i * 2 + 1];
        if (!marketRes || marketRes.status !== "success") return null;
        const tuple = marketRes.result as unknown as readonly [
          string,
          bigint,
          number,
          number,
          `0x${string}`,
          boolean,
          unknown,
          `0x${string}`,
          `0x${string}`,
          number
        ];
        const [question, expiry, modelId, storedStatus, creator, yesIsCurrency0, , yesToken, noToken, winningChoice] = tuple;
        const effectiveStatus =
          statusRes && statusRes.status === "success" ? Number(statusRes.result as number) : Number(storedStatus);
        return {
          id,
          question,
          expiry,
          modelId: Number(modelId),
          storedStatus: Number(storedStatus),
          effectiveStatus,
          creator,
          yesToken,
          noToken,
          yesIsCurrency0,
          winningChoice: Number(winningChoice)
        };
      })
      .filter((m): m is MarketSummary => m !== null);
  }, [idList, query.data]);

  return { ...query, summaries };
}

/**
 * Live implied YES probability for each market, read straight from the v4 pool.
 *
 * In this binary AMM a YES+NO pair always mints/redeems for 1 USDT, so
 * price(YES) + price(NO) = 1 and the marginal exchange rate is reserveNO/reserveYES.
 * Solving gives price(YES) = reserveNO / (reserveYES + reserveNO). The pool's reserves
 * are simply the outcome-token balances held by the singleton PoolManager (each outcome
 * token is unique to one pool, so balanceOf(poolManager) is that pool's reserve).
 *
 * Returns a Map keyed by market id string → YES probability in [0,1], or null when the
 * pool has no liquidity / the read failed. Polls so cards reflect trades within seconds.
 */
export function useMarketProbabilities(
  markets: { id: bigint; yesToken: `0x${string}`; noToken: `0x${string}` }[] | readonly MarketSummary[]
) {
  const list = useMemo(
    () => markets.map((m) => ({ id: m.id, yesToken: m.yesToken, noToken: m.noToken })),
    [markets]
  );

  const contracts = useMemo(
    () =>
      list.flatMap((m) => [
        {
          address: m.yesToken,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [ADDRESSES.poolManager] as const
        },
        {
          address: m.noToken,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [ADDRESSES.poolManager] as const
        }
      ]),
    [list]
  );

  const query = useReadContracts({
    contracts,
    allowFailure: true,
    query: { enabled: list.length > 0, refetchInterval: 12_000 }
  });

  const probabilities = useMemo(() => {
    const data = query.data ?? [];
    const map = new Map<string, number | null>();
    list.forEach((m, i) => {
      const yesRes = data[i * 2];
      const noRes = data[i * 2 + 1];
      if (yesRes?.status === "success" && noRes?.status === "success") {
        const reserveYes = yesRes.result as bigint;
        const reserveNo = noRes.result as bigint;
        const denom = reserveYes + reserveNo;
        // basis-point division keeps full precision on 18-decimal bigints
        map.set(m.id.toString(), denom > 0n ? Number((reserveNo * 10_000n) / denom) / 10_000 : null);
      } else {
        map.set(m.id.toString(), null);
      }
    });
    return map;
  }, [list, query.data]);

  return { probabilities, ...query };
}

/**
 * Resolved-card proof deep-link support. For resolved markets ONLY, batch-fetch
 * `marketLastRequestId` then `getRequest` to surface the IPFS reasoning CID directly on
 * the card. Gated to the resolved ids passed in, so no extra reads happen for live markets.
 * A flaky/empty read simply leaves the CID absent — the card falls back to the detail link.
 *
 * Read-only and additive: it does not touch the probability math or any existing read.
 */
export function useResolvedProofCids(resolvedIds: bigint[] | readonly bigint[]) {
  const idList = useMemo(() => Array.from(resolvedIds), [resolvedIds]);

  const requestIdContracts = useMemo(
    () =>
      idList.map((id) => ({
        address: ADDRESSES.hook,
        abi: PythiaHookAbi,
        functionName: "marketLastRequestId" as const,
        args: [id] as const
      })),
    [idList]
  );

  const requestIdQuery = useReadContracts({
    contracts: requestIdContracts,
    allowFailure: true,
    query: { enabled: idList.length > 0 }
  });

  // Pair each market id with its request id (only those that resolved to a real request).
  const requestPairs = useMemo(() => {
    const data = requestIdQuery.data ?? [];
    return idList
      .map((id, i) => {
        const res = data[i];
        const requestId = res && res.status === "success" ? (res.result as bigint) : 0n;
        return { id, requestId };
      })
      .filter((p) => p.requestId > 0n);
  }, [idList, requestIdQuery.data]);

  const requestContracts = useMemo(
    () =>
      requestPairs.map((p) => ({
        address: ADDRESSES.provider,
        abi: PythiaAIProviderAbi,
        functionName: "getRequest" as const,
        args: [p.requestId] as const
      })),
    [requestPairs]
  );

  const requestQuery = useReadContracts({
    contracts: requestContracts,
    allowFailure: true,
    query: { enabled: requestPairs.length > 0 }
  });

  const cids = useMemo(() => {
    const data = requestQuery.data ?? [];
    const map = new Map<string, string>();
    requestPairs.forEach((p, i) => {
      const res = data[i];
      if (res && res.status === "success") {
        const view = res.result as unknown as { reasoningCid?: string } | undefined;
        const cid = view?.reasoningCid;
        if (cid && cid.length > 0) map.set(p.id.toString(), cid);
      }
    });
    return map;
  }, [requestPairs, requestQuery.data]);

  return { cids };
}
