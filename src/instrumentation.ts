export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runPrefetch } = await import('./lib/tiles');
    runPrefetch().catch(console.error);
  }
}
