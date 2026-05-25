import Header from "@/components/Header";
import MarketDetail from "@/components/MarketDetail";

export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let marketId: bigint;
  try {
    marketId = BigInt(id);
  } catch {
    return (
      <>
        <Header />
        <main className="max-w-3xl mx-auto px-6 py-12 text-rose-400">Invalid market id: {id}</main>
      </>
    );
  }
  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <MarketDetail marketId={marketId} />
      </main>
    </>
  );
}
