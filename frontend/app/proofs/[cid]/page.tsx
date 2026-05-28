import Header from "@/components/Header";
import ProofViewer from "@/components/ProofViewer";

export default async function ProofPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return (
    <>
      <Header />
      <main className="page page--narrow">
        <div className="page-head">
          <div>
            <h1 className="page-title">AI reasoning trail</h1>
            <p className="page-subtitle">Fetched from IPFS — first responsive gateway wins.</p>
          </div>
        </div>
        <ProofViewer cid={cid} />
      </main>
    </>
  );
}
