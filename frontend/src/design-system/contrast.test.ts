import { describe, expect, it } from 'vitest';

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255);

  if (!channels || channels.length !== 3) {
    throw new Error(`Invalid six-digit color: ${hex}`);
  }

  const [red, green, blue] = channels as [number, number, number];
  const linearize = (channel: number) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );

  return linearize(red) * 0.2126 + linearize(green) * 0.7152 + linearize(blue) * 0.0722;
}

function contrast(first: string, second: string) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('NodeFlow light palette contrast', () => {
  it.each([
    ['foreground on canvas', '#0f172a', '#f8fafc'],
    ['muted text on surface', '#475569', '#ffffff'],
    ['brand button text', '#ffffff', '#1e3a5f'],
    ['action link on surface', '#2563eb', '#ffffff'],
    ['success status on soft surface', '#15803d', '#f0fdf4'],
    ['danger status on soft surface', '#b91c1c', '#fef2f2'],
    ['paused status on soft surface', '#6d28d9', '#f5f3ff'],
  ])('%s meets WCAG AA for normal text', (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['focus ring on canvas', '#2563eb', '#f8fafc'],
    ['control border against surface', '#64748b', '#ffffff'],
  ])('%s meets the non-text contrast target', (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(3);
  });
});
