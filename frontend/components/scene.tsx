"use client";
import { useEffect, useRef } from "react";
export function Scene() {
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scene.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touch = window.matchMedia("(pointer: coarse)");
    let frame = 0;
    function move(e: PointerEvent) {
      if (reduced.matches || touch.matches || frame) return;
      frame = requestAnimationFrame(() => {
        el!.style.setProperty(
          "--mx",
          `${(e.clientX / innerWidth - 0.5) * 10}px`,
        );
        el!.style.setProperty(
          "--my",
          `${(e.clientY / innerHeight - 0.5) * 8}px`,
        );
        frame = 0;
      });
    }
    function visibility() {
      el!.classList.toggle("paused", document.hidden);
    }
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", visibility);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div className="scene" ref={scene} aria-hidden="true">
      <div className="scene-mountains" />
      <img
        className="scene-financial"
        src="/assets/fenix/financial.png"
        alt=""
      />
      <div className="phoenix-depth">
        <div className="phoenix">
          <img
            className="wing wing-right"
            src="/assets/fenix/wing-right.png"
            alt=""
          />
          <img
            className="wing wing-left"
            src="/assets/fenix/wing-left.png"
            alt=""
          />
          <img className="phoenix-body" src="/assets/fenix/body.png" alt="" />
        </div>
      </div>
      <img className="scene-clouds" src="/assets/fenix/clouds.png" alt="" />
      <div className="embers">
        {Array.from({ length: 22 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${8 + i * 2.7}%`,
              top: `${30 + ((i * 17) % 60)}%`,
              animationDelay: `${-(i * 1.7)}s`,
              animationDuration: `${7 + (i % 6)}s`,
            }}
          />
        ))}
      </div>
      <div className="scene-shade" />
    </div>
  );
}
