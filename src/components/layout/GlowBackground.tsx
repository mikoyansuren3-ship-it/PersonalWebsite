export default function GlowBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Primary warm orange blob — top left */}
      <div
        className="blob-1 absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(249,115,22,0.22) 0%, rgba(234,88,12,0.08) 60%, transparent 80%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Secondary amber blob — bottom right */}
      <div
        className="blob-2 absolute -bottom-40 -right-20 w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(251,146,60,0.18) 0%, rgba(249,115,22,0.06) 60%, transparent 80%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Subtle cool undertone blob — centre */}
      <div
        className="blob-3 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Fine noise texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 200px',
        }}
      />
    </div>
  )
}
