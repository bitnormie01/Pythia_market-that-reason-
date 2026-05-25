import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { metaMaskWallet, okxWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { xLayer } from "./chain";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "pythia-demo";

export const wagmiConfig = getDefaultConfig({
  appName: "Pythia",
  projectId,
  chains: [xLayer],
  wallets: [
    {
      groupName: "Recommended",
      wallets: [okxWallet, metaMaskWallet, walletConnectWallet]
    }
  ],
  ssr: true
});
