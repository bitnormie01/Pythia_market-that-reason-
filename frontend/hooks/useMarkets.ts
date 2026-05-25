"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";

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
