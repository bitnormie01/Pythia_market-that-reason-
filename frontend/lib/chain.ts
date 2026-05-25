import { defineChain } from "viem";

export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.xlayer.tech",
        "https://rpc.ankr.com/xlayer",
        "https://xlayerrpc.okx.com"
      ]
    }
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://www.oklink.com/xlayer" }
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" }
  }
});
