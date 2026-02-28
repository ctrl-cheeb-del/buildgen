"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";

const PixelBlast = dynamic(() => import("@/components/PixelBlast"), {
  ssr: false,
});

export default function LandingPage() {
  const { isSignedIn } = useUser();
  const dest = isSignedIn ? "/world" : "/login";

  return (
    <div className="ld">
      {/* ── Nav pill ── */}
      <nav className="ld-nav">
        <div className="ld-nav-pill">
          <span className="ld-nav-wordmark">Ministral</span>
          <div className="ld-nav-right">
            <Link href="/world" className="ld-nav-link">
              Explore
            </Link>
            <Link href={dest} className="ld-nav-enter">
              {isSignedIn ? "Enter world" : "Sign in"}&nbsp;&rsaquo;
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="ld-hero">
        <div className="ld-hero-shader">
          <PixelBlast
            variant="square"
            pixelSize={4}
            color="#B19EEF"
            patternScale={2}
            patternDensity={1}
            enableRipples
            rippleSpeed={0.4}
            rippleThickness={0.12}
            rippleIntensityScale={1.5}
            speed={0.5}
            edgeFade={0.25}
            transparent
          />
        </div>

        <div className="ld-hero-content">
          <p className="ld-hero-eyebrow">The first agentic city builder</p>
          <h1 className="ld-hero-h1">
            Describe a building.
            <br />
            <span className="ld-hero-h1-em">Watch it appear.</span>
          </h1>
          <p className="ld-hero-sub">
            Claim a plot in a shared world. Tell AI what to build.
            <br />
            Walk the streets, drive around, explore together.
          </p>
          <Link href={dest} className="ld-hero-cta">
            {isSignedIn ? "Enter the world" : "Get started"}&nbsp;&rsaquo;
          </Link>
        </div>
      </section>

      {/* ── Showcase: image with frosted glass overlay ── */}
      <section className="pb-12 ld-showcase-anim max-w-[80%] mx-auto">
        <div className="relative rounded-[20px] overflow-hidden bg-[#1a1a2e] shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_40px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.04)]">
          <Image
            src="/building.jpg"
            alt="Pixel-art city with robots and workers building skyscrapers"
            width={1600}
            height={700}
            className="block w-full aspect-[16/7] object-cover object-[center_35%]"
            draggable={false}
            priority
          />

          {/* Frosted glass pill — center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="frosted-glass px-12 py-8 max-w-xl text-center">
              <p className="font-[family-name:var(--px)] text-[clamp(18px,2.8vw,30px)] text-white leading-snug tracking-tight">
                The first agentic game
              </p>
              <p className="font-[family-name:var(--px)] text-[clamp(10px,1.2vw,13px)] text-white/70 mt-3 leading-relaxed">
                Where humans and AI agents collaborate to build cities together
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="flex flex-col items-center text-center py-24 px-6">
        <h2 className="font-[family-name:var(--px)] text-[clamp(24px,4vw,44px)] text-[var(--ink)] leading-tight mb-4">
          Ready to build?
        </h2>
        <p className="font-[family-name:var(--px)] text-[12px] text-[var(--ink-mid)] mb-8 max-w-md leading-relaxed">
          Join the shared world. Claim your plot and generate your first
          AI-powered building in seconds.
        </p>
        <Link
          href={dest}
          className="font-[family-name:var(--px)] text-[13px] text-white bg-[var(--ink)] px-10 py-4 rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent-deep)] hover:shadow-[0_8px_28px_rgba(124,95,214,0.3)]"
        >
          {isSignedIn ? "Enter the world" : "Get started"}&nbsp;&rsaquo;
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="px-[--gutter] py-6 flex items-center justify-between">
        <span className="font-[family-name:var(--px)] text-[11px] text-[var(--ink-light)]">
          Ministral
        </span>
        <span className="font-[family-name:var(--px)] text-[10px] text-[var(--ink-light)] tracking-wider">
          Convex&ensp;/&ensp;Three.js&ensp;/&ensp;Mistral
        </span>
      </footer>
    </div>
  );
}
