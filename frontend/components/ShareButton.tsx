"use client";

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
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
    >
      Share on X
    </a>
  );
}
