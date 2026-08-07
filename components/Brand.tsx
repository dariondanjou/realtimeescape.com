'use client';

import { useEffect, useRef } from 'react';

/** The 3D tetromino mark, inline so it needs no network request. */
export function Mark({ size = 19 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <g stroke="#14191a" strokeWidth="2" strokeLinejoin="round">
        <polygon points="28,11.9 50,24.6 28,37.3 6,24.6" fill="#cad4d4" />
        <polygon points="50,50 28,62.7 28,37.3 50,24.6" fill="#3b4746" />
        <polygon points="6,50 28,62.7 28,37.3 6,24.6" fill="#768484" />
        <polygon points="50,24.6 72,37.3 50,50 28,37.3" fill="#cad4d4" />
        <polygon points="72,62.7 50,75.4 50,50 72,37.3" fill="#3b4746" />
        <polygon points="28,62.7 50,75.4 50,50 28,37.3" fill="#768484" />
        <polygon points="72,37.3 94,50 72,62.7 50,50" fill="#cad4d4" />
        <polygon points="94,75.4 72,88.1 72,62.7 94,50" fill="#3b4746" />
        <polygon points="50,75.4 72,88.1 72,62.7 50,50" fill="#768484" />
        <polygon points="72,11.9 94,24.6 72,37.3 50,24.6" fill="#7fd4f5" />
        <polygon points="94,50 72,62.7 72,37.3 94,24.6" fill="#14567d" />
        <polygon points="50,50 72,62.7 72,37.3 50,24.6" fill="#35a8dc" />
      </g>
    </svg>
  );
}

/**
 * Brand wordmark. Glitches on a randomised 7–11 second cadence — the same signature the
 * site launched with, kept as the identity. Honours prefers-reduced-motion.
 */
export function GlitchWord({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let onTimer: ReturnType<typeof setTimeout>;
    let offTimer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      onTimer = setTimeout(() => {
        ref.current?.classList.add('on');
        offTimer = setTimeout(() => {
          ref.current?.classList.remove('on');
          schedule();
        }, 350);
      }, 7000 + Math.random() * 4000);
    };

    schedule();
    return () => {
      clearTimeout(onTimer);
      clearTimeout(offTimer);
    };
  }, []);

  return (
    <span ref={ref} className={`glitch ${className}`} data-text={text}>
      {text}
    </span>
  );
}
