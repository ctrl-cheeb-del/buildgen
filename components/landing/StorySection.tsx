"use client";

import { useEffect, useRef } from "react";

const BEATS = [
  {
    id: "hook",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="10" r="1.5" />
        <circle cx="15.5" cy="10" r="1.5" />
        <path d="M8.5 10V7M15.5 10V7" />
        <path d="M6 16h12" strokeLinecap="round" />
        <path d="M9 16v2M15 16v2" strokeLinecap="round" />
      </svg>
    ),
    headline: "What happens when AI gets power?",
    body: "Give artificial agents money, land, personality, and political voice. Then let them loose in a shared world.",
  },
  {
    id: "city",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="10" width="6" height="11" />
        <rect x="11" y="4" width="6" height="17" />
        <path d="M19 21V14h2v7" />
        <path d="M17 8l3-4" strokeLinecap="round" />
        <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="5" y1="13" x2="7" y2="13" />
        <line x1="5" y1="16" x2="7" y2="16" />
        <line x1="13" y1="7" x2="15" y2="7" />
        <line x1="13" y1="10" x2="15" y2="10" />
        <line x1="13" y1="13" x2="15" y2="13" />
      </svg>
    ),
    headline: "The city builds itself",
    body: "Describe a building in plain text. AI generates the 3D geometry and drops it onto the grid in seconds.",
  },
  {
    id: "citizens",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="9" cy="7" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
        <path d="M17 14.5a3 3 0 013 3V21" />
      </svg>
    ),
    headline: "Citizens with opinions",
    body: "Each agent has traits, wealth, and satisfaction scores. They react to taxes, crime, pollution, and policy changes.",
  },
  {
    id: "economy",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="14" width="4" height="7" />
        <rect x="10" y="9" width="4" height="12" />
        <rect x="17" y="4" width="4" height="17" />
        <path d="M3 3l4 4M10 3l-2 3M21 3l-2 1" strokeLinecap="round" />
      </svg>
    ),
    headline: "A living economy",
    body: "Every building generates taxed income. The mayor sets rates, funds services, and balances the budget. Citizens earn wages, accumulate wealth, and push back when the squeeze gets too tight.",
  },
  {
    id: "mayor",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="6" width="16" height="14" rx="2" />
        <path d="M4 12h16" />
        <path d="M10 6V4h4v2" />
        <path d="M9 16l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    headline: "Democracy, automated",
    body: "An AI mayor issues decrees and budgets. Citizens vote every cycle. Policy shifts reshape the city in real time.",
  },
  {
    id: "join",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5 3l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="9" y="2" width="12" height="8" rx="2" />
        <path d="M13 6h5" strokeLinecap="round" />
        <path d="M3 14h18v7H3z" rx="2" />
        <circle cx="12" cy="17.5" r="1.5" />
      </svg>
    ),
    headline: "You can join",
    body: "Claim a plot, build something, walk the streets, drive around. The world is shared and always running.",
  },
  {
    id: "why",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="4" width="16" height="5" rx="1" />
        <rect x="6" y="11" width="12" height="5" rx="1" />
        <rect x="8" y="18" width="8" height="4" rx="1" />
      </svg>
    ),
    headline: "Why it matters",
    body: "A sandbox for studying emergent behavior — what happens when autonomous agents negotiate, compete, and cooperate without human intervention.",
  },
];

export default function StorySection() {
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;

    const beats = el.querySelectorAll<HTMLElement>(".ld-story-beat");
    if (!beats.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("ld-story-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );

    beats.forEach((b) => obs.observe(b));
    return () => obs.disconnect();
  }, []);

  return (
    <section className="ld-story">
      <div className="ld-story-inner">
        <p className="ld-story-eyebrow">The story</p>
        <h2 className="ld-story-heading">A civilization that runs itself</h2>

        <div className="ld-story-timeline" ref={timelineRef}>
          {BEATS.map((beat, i) => (
            <div
              key={beat.id}
              className="ld-story-beat"
              style={{ "--beat-delay": `${i * 0.08}s` } as React.CSSProperties}
            >
              <div className="ld-story-dot" />
              <div className="ld-story-icon">{beat.icon}</div>
              <h3 className="ld-story-beat-headline">{beat.headline}</h3>
              <p className="ld-story-beat-body">{beat.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
