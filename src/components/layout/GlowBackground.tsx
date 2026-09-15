"use client";

export default function GlowBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[#09090b]" />
      {/* Indigo blob - top left */}
      <div
        className="absolute -top-[20%] -left-[10%] h-[600px] w-[600px] rounded-full opacity-30 blur-[120px]"
        style={{ background: "radial-gradient(circle, #6366f1, transparent 70%)" }}
      />
      {/* Violet blob - center right */}
      <div
        className="absolute top-[30%] -right-[10%] h-[500px] w-[500px] rounded-full opacity-20 blur-[120px]"
        style={{ background: "radial-gradient(circle, #8b5cf6, transparent 70%)" }}
      />
      {/* Cyan blob - bottom left */}
      <div
        className="absolute -bottom-[10%] left-[20%] h-[400px] w-[400px] rounded-full opacity-20 blur-[120px]"
        style={{ background: "radial-gradient(circle, #06b6d4, transparent 70%)" }}
      />
    </div>
  );
}
