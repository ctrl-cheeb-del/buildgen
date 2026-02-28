"use client";

interface WalkModeButtonProps {
  onClick: () => void;
}

export default function WalkModeButton({ onClick }: WalkModeButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/90 text-gray-700 hover:bg-white shadow-md transition-all"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="5" r="2" />
        <path d="M10 22V18L7 15l3-3 3 3-3 3" />
        <path d="M14 22V18l3-3-3-3" />
      </svg>
      Walk
    </button>
  );
}
