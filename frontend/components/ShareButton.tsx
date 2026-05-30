"use client";

import { Icon } from "@/components/ui";

export type Outcome = "YES" | "NO" | "INVALID";

export function ShareButton({
  question,
  outcome,
  proofUrl
}: {
  question: string;
  outcome: Outcome;
  proofUrl: string;
}) {
  const trimmed = question.length > 120 ? `${question.slice(0, 117)}…` : question;
  const text = `@XLayerOfficial @Uniswap @flapdotsh — Pythia just resolved: "${trimmed}" → ${outcome}\n\nRead the AI's reasoning: ${proofUrl}\n\n#XLayer #UniswapV4`;
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="btn btn--sm">
      <Icon name="external" size={12} /> Share on X
    </a>
  );
}
