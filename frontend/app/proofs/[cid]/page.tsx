import Header from "@/components/Header";
import ProofViewer from "@/components/ProofViewer";

export default async function ProofPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-mono mb-1 text-zinc-300">AI reasoning trail</h1>
        <p className="text-xs text-zinc-500 mb-6">Fetched from IPFS — first responsive gateway wins.</p>
        <ProofViewer cid={cid} />
      </main>
    </>
  );
}
