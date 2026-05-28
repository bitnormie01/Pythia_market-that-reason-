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
        <main className="page page--narrow">
          <div className="banner banner--warn">Invalid market id: {id}</div>
        </main>
      </>
    );
  }
  return (
    <>
      <Header />
      <main className="page">
        <MarketDetail marketId={marketId} />
      </main>
    </>
  );
}
