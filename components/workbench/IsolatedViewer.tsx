"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { WorkbenchRenderer } from "@/lib/viewer/workbench-renderer";
import type { CameraAngle, WorkbenchScreenshots } from "@/lib/types";

export interface IsolatedViewerHandle {
  captureAllViews: () => WorkbenchScreenshots;
  loadCode: (code: string) => void;
}

interface IsolatedViewerProps {
  code?: string;
}

const ANGLE_BUTTONS: { label: string; angle: CameraAngle }[] = [
  { label: "Front", angle: "front" },
  { label: "Right", angle: "right" },
  { label: "Back", angle: "back" },
  { label: "Left", angle: "left" },
  { label: "Top", angle: "top" },
  { label: "3D", angle: "perspective" },
];

const IsolatedViewer = forwardRef<IsolatedViewerHandle, IsolatedViewerProps>(
  function IsolatedViewer({ code }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<WorkbenchRenderer | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const wb = new WorkbenchRenderer(canvas);
      rendererRef.current = wb;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            wb.resize(width, height);
          }
        }
      });
      resizeObserver.observe(canvas.parentElement!);

      return () => {
        resizeObserver.disconnect();
        wb.dispose();
        rendererRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (code && rendererRef.current) {
        rendererRef.current.loadCode(code);
      }
    }, [code]);

    const handleAngle = useCallback((angle: CameraAngle) => {
      rendererRef.current?.setCameraAngle(angle);
    }, []);

    useImperativeHandle(ref, () => ({
      captureAllViews: () => {
        if (!rendererRef.current) {
          throw new Error("Renderer not initialized");
        }
        return rendererRef.current.captureAllViews();
      },
      loadCode: (c: string) => {
        rendererRef.current?.loadCode(c);
      },
    }));

    return (
      <div className="flex flex-col h-full">
        <div className="flex gap-1 p-2 bg-gray-900 border-b border-gray-700">
          {ANGLE_BUTTONS.map(({ label, angle }) => (
            <button
              key={angle}
              onClick={() => handleAngle(angle)}
              className="px-2.5 py-1 text-xs font-medium text-gray-300 bg-gray-800 rounded hover:bg-gray-700 hover:text-white transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative bg-gray-900">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        </div>
      </div>
    );
  }
);

export default IsolatedViewer;
