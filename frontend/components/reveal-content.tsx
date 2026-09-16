"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Progressive enhancement: content remains readable even without animations. */
export function RevealContent({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const surface = root.current;
    if (!surface || !window.IntersectionObserver) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const seen = new WeakSet<Element>();
    const animations = new Map<Element, Animation>();
    const selector = ".page-heading, .section-heading, .kpi, .panel, .action-notice";
    const observer = new IntersectionObserver((entries) => {
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (preference.matches || entry.target.contains(document.activeElement)) continue;
        const card = entry.target.matches(".kpi, .account-card");
        const animation = entry.target.animate(
          [
            { opacity: 0, transform: card ? "translateY(24px) scale(.975)" : "translateY(20px)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: card ? 620 : 760, delay: Math.min(order++ * 65, 260), easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" },
        );
        animations.set(entry.target, animation);
        animation.onfinish = () => animations.delete(entry.target);
      }
    }, { threshold: 0, rootMargin: "0px 0px -24px 0px" });
    const scan = () => {
      surface.querySelectorAll(selector).forEach((element) => {
        if (seen.has(element) || element.parentElement?.closest(selector)) return;
        seen.add(element);
        observer.observe(element);
      });
    };
    const cancel = () => {
      animations.forEach((animation) => animation.cancel());
      animations.clear();
    };
    const focus = (event: FocusEvent) => {
      animations.forEach((animation, element) => {
        if (element.contains(event.target as Node)) {
          animation.cancel();
          animations.delete(element);
        }
      });
    };
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(surface, { childList: true, subtree: true });
    preference.addEventListener("change", cancel);
    surface.addEventListener("focusin", focus);
    return () => {
      cancel();
      observer.disconnect();
      mutations.disconnect();
      preference.removeEventListener("change", cancel);
      surface.removeEventListener("focusin", focus);
    };
  }, []);
  return <main ref={root} id="main" className="main-content">{children}</main>;
}
