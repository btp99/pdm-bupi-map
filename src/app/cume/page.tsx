import dynamic from 'next/dynamic';

const CumeMap = dynamic(() => import('@/components/CumeMap'), { ssr: false });

export const metadata = {
  title: 'Cume · Carapito — Mapa Aguiar da Beira',
};

export default function CumePage() {
  return (
    <main style={{ height: '100vh', width: '100vw' }}>
      <CumeMap />
    </main>
  );
}
