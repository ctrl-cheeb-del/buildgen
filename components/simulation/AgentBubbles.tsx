"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useQuery } from "convex/react";
import * as THREE from "three";
import { api } from "@/convex/_generated/api";
import type { SceneLayer } from "@/lib/viewer/scene-layer";
import { gridIndexToColRow, plotCenterMeters } from "@/lib/grid/grid-geometry";

const TYPE_COLORS: Record<string, string> = {
  chat: "#ffffff",
  petition: "#facc15",
  protest: "#ef4444",
  praise: "#22c55e",
  announcement: "#f59e0b",
  build_request: "#3b82f6",
};

const TYPE_BG: Record<string, string> = {
  chat: "rgba(255,255,255,0.95)",
  petition: "rgba(250,204,21,0.95)",
  protest: "rgba(239,68,68,0.95)",
  praise: "rgba(34,197,94,0.95)",
  announcement: "rgba(245,158,11,0.95)",
  build_request: "rgba(59,130,246,0.95)",
};

const TYPE_TEXT: Record<string, string> = {
  chat: "#1f2937",
  petition: "#78350f",
  protest: "#ffffff",
  praise: "#052e16",
  announcement: "#78350f",
  build_request: "#ffffff",
};

interface BubbleData {
  id: string;
  plotIndex: number;
  senderName: string;
  content: string;
  messageType: string;
  createdAt: number;
}

interface AgentBubblesProps {
  layer: SceneLayer | null;
  onAgentClick?: (plotIndex: number) => void;
}

export default function AgentBubbles({ layer, onAgentClick }: AgentBubblesProps) {
  const cityState = useQuery(api.simulation.cityState.get);
  const currentTick = cityState?.totalTicks ?? 0;
  const messages = useQuery(
    api.simulation.agentMessages.getRecent,
    currentTick > 2 ? { afterTick: currentTick - 3 } : { afterTick: 0 }
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);

  const worldToScreen = useCallback(
    (plotIndex: number): { x: number; y: number } | null => {
      if (!layer) return null;
      const camera = layer.getCamera() as THREE.PerspectiveCamera;
      const canvas = layer.getCanvas();
      const { col, row } = gridIndexToColRow(plotIndex);
      const [mx, mz] = plotCenterMeters(col, row);
      const pos = new THREE.Vector3(mx, 15, mz); // float above buildings
      pos.project(camera);
      if (pos.z > 1) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((pos.x + 1) / 2) * rect.width + rect.left,
        y: ((-pos.y + 1) / 2) * rect.height + rect.top,
      };
    },
    [layer]
  );

  // Deduplicate: latest message per plot
  const latestByPlot = useRef<Map<number, BubbleData>>(new Map());

  useEffect(() => {
    if (!messages) return;
    const map = new Map<number, BubbleData>();
    for (const msg of messages) {
      const existing = map.get(msg.senderPlotIndex);
      if (!existing || msg.createdAt > existing.createdAt) {
        map.set(msg.senderPlotIndex, {
          id: (msg as any)._id,
          plotIndex: msg.senderPlotIndex,
          senderName: msg.senderName,
          content: msg.content,
          messageType: msg.messageType,
          createdAt: msg.createdAt,
        });
      }
    }
    latestByPlot.current = map;
  }, [messages]);

  // Render loop: update bubble positions each frame
  useEffect(() => {
    if (!layer || !containerRef.current) return;

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const container = containerRef.current;
      if (!container) return;

      const now = Date.now();
      const existingIds = new Set<string>();

      for (const [, bubble] of latestByPlot.current) {
        const age = now - bubble.createdAt;
        if (age > 15000) continue; // fade out after 15s

        existingIds.add(bubble.id);
        const screen = worldToScreen(bubble.plotIndex);
        if (!screen) {
          bubblesRef.current.get(bubble.id)?.style.setProperty("display", "none");
          continue;
        }

        let el = bubblesRef.current.get(bubble.id);
        if (!el) {
          el = document.createElement("div");
          el.className = "agent-bubble";
          el.style.cssText = `
            position: fixed; z-index: 40; pointer-events: auto; cursor: pointer;
            max-width: 200px; padding: 6px 10px; border-radius: 8px;
            font-family: system-ui; font-size: 11px; line-height: 1.3;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            transform: translate(-50%, -100%);
            transition: opacity 0.3s;
          `;
          const plotIdx = bubble.plotIndex;
          el.addEventListener("click", () => {
            setSelectedAgent(plotIdx);
            onAgentClick?.(plotIdx);
          });
          container.appendChild(el);
          bubblesRef.current.set(bubble.id, el);
        }

        const bg = TYPE_BG[bubble.messageType] ?? TYPE_BG.chat;
        const textColor = TYPE_TEXT[bubble.messageType] ?? TYPE_TEXT.chat;
        const opacity = age > 12000 ? Math.max(0, 1 - (age - 12000) / 3000) : 1;

        el.style.left = `${screen.x}px`;
        el.style.top = `${screen.y}px`;
        el.style.background = bg;
        el.style.color = textColor;
        el.style.opacity = `${opacity}`;
        el.style.display = "";
        el.innerHTML = `<div style="font-weight:600;font-size:10px;margin-bottom:2px">${escHtml(bubble.senderName)}</div><div>${escHtml(bubble.content)}</div>`;
      }

      // Remove stale bubbles
      for (const [id, el] of bubblesRef.current) {
        if (!existingIds.has(id)) {
          el.remove();
          bubblesRef.current.delete(id);
        }
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frameId);
      for (const [, el] of bubblesRef.current) el.remove();
      bubblesRef.current.clear();
    };
  }, [layer, worldToScreen, onAgentClick]);

  return <div ref={containerRef} className="pointer-events-none" />;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
