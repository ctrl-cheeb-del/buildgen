"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useIntroStore } from "@/lib/stores/intro-store";

export default function LoadingOverlay() {
  const phase = useIntroStore((s) => s.phase);

  return (
    <AnimatePresence>
      {phase === "loading" && (
        <motion.div
          key="loading-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
        >
          {/* Scanline overlay */}
          <div className="absolute inset-0 pointer-events-none loading-scanlines" />

          {/* CRT vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%)",
            }}
          />

          {/* Content */}
          <div className="relative flex flex-col items-center gap-6">
            <p className="font-mono text-[#B19EEF] text-lg tracking-[0.3em] uppercase loading-text-pulse">
              Loading City
            </p>

            {/* Progress bar */}
            <div className="w-48 h-1.5 bg-[#7c5fd6]/30 rounded-full overflow-hidden">
              <div className="h-full bg-[#B19EEF] rounded-full animate-loading-bar" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
