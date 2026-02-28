/**
 * Capture the current map canvas as a PNG data URL.
 */
export function captureScreenshot(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}
