import Header from "@/components/Header";
import CreateMarketForm from "@/components/CreateMarketForm";

export default function CreatePage() {
  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-mono mb-2">Create market</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Deploy a binary YES/NO market on X Layer. Pythia will reason over the question with whitelisted
          tools and publish an IPFS proof trail.
        </p>
        <CreateMarketForm />
      </main>
    </>
  );
}
