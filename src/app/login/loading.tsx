export default function LoginLoading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-[#faf7f0] px-6 py-24" aria-busy="true" aria-label="Loading sign-in">
      <div className="w-full max-w-sm space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-[#1c1917]/10" aria-hidden="true" />
        <div className="h-12 animate-pulse rounded-full bg-[#1c1917]/10" aria-hidden="true" />
        <div className="h-48 animate-pulse rounded-2xl bg-[#1c1917]/10" aria-hidden="true" />
      </div>
    </main>
  );
}
