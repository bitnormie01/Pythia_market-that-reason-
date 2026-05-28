import Header from "@/components/Header";
import CreateMarketForm from "@/components/CreateMarketForm";

export default function CreatePage() {
  return (
    <>
      <Header />
      <main className="page page--narrow">
        <div className="page-head">
          <div>
            <h1 className="page-title">Create market</h1>
            <p className="page-subtitle">
              Deploy a binary YES/NO market on X Layer with whitelisted resolver tools and an IPFS proof trail.
            </p>
          </div>
        </div>
        <CreateMarketForm />
      </main>
    </>
  );
}
