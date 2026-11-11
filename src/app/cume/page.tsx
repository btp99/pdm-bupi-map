import dynamic from 'next/dynamic';

const CumeMap = dynamic(() => import('@/components/CumeMap'), { ssr: false });

export const metadata = {
  title: 'Cume · Carapito — Mapa Aguiar da Beira',
};

export default function CumePage() {
  return (
    <main style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <CumeMap />
      <form action="/api/auth/logout" method="POST" style={{ position: 'absolute', bottom: 32, left: 12, zIndex: 1000 }}>
        <button
          type="submit"
          style={{ padding: '0.375rem 0.75rem', background: 'white', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', color: '#374151', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
        >
          Sair
        </button>
      </form>
    </main>
  );
}
