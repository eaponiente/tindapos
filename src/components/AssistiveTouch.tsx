'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MenuIcon } from './Icons';

const SIZE = 54;

/** iOS-style floating "assistive touch" button (mobile only). Tap to open the
 *  navigation menu; drag it anywhere so it never blocks the content, and it
 *  snaps to the nearest side edge when released. */
export default function AssistiveTouch({ onOpen }: { onOpen: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const clamp = (x: number, y: number) => ({
      x: Math.max(6, Math.min(window.innerWidth - SIZE - 6, x)),
      y: Math.max(70, Math.min(window.innerHeight - SIZE - 70, y)),
    });
    setPos((p) =>
      p ? clamp(p.x, p.y) : clamp(window.innerWidth - SIZE - 10, Math.round(window.innerHeight * 0.55)),
    );
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function down(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (pos) drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    setPos({
      x: Math.max(6, Math.min(window.innerWidth - SIZE - 6, d.ox + dx)),
      y: Math.max(6, Math.min(window.innerHeight - SIZE - 6, d.oy + dy)),
    });
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      onOpen();
    } else {
      // Snap to whichever side edge is closer.
      setPos((p) =>
        p ? { ...p, x: p.x + SIZE / 2 < window.innerWidth / 2 ? 8 : window.innerWidth - SIZE - 8 } : p,
      );
    }
  }

  if (!pos) return null;
  return (
    <button
      className="assistiveTouch"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => (drag.current = null)}
      aria-label="Open menu"
    >
      <MenuIcon />
    </button>
  );
}
