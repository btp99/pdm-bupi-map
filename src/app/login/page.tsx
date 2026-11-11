export const metadata = {
  title: 'Login · Cume',
};

type Props = { searchParams: { error?: string } };

export default function LoginPage({ searchParams }: Props) {
  return (
    <main style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e' }}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: '2.5rem',
        width: '100%',
        maxWidth: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <h1 style={{ margin: '0 0 0.375rem', fontSize: '1.4rem', color: '#1a1a2e' }}>Cume · Carapito</h1>
        <p style={{ margin: '0 0 1.5rem', color: '#888', fontSize: '0.875rem' }}>Área restrita</p>

        {searchParams.error && (
          <p style={{ margin: '0 0 1rem', color: '#dc2626', fontSize: '0.875rem', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: 6 }}>
            Credenciais inválidas.
          </p>
        )}

        <form action="/api/auth/login" method="POST" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', color: '#374151' }}>
              Utilizador
            </label>
            <input
              name="username"
              type="text"
              autoComplete="username"
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', color: '#374151' }}>
              Password
            </label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem', boxSizing: 'border-box' }}
            />
          </div>
          <button
            type="submit"
            style={{ padding: '0.625rem', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 6, fontSize: '1rem', cursor: 'pointer', marginTop: '0.25rem' }}
          >
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
