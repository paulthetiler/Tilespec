"use client";

import { useEffect } from "react";

export default function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const targets = document.querySelectorAll<HTMLElement>(
      "main section:not(.hero) h2, main section:not(.hero) .section-head, main .ts-photo-service, main .process-grid > div, main .project-card, main .sector-list > div, main .homepage-contact-choice, main .ts-live-proof-item, main .ts-live-intro p, main .tender-details"
    );
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        el.classList.add("ts-reveal-visible");
        observer.unobserve(el);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });

    targets.forEach((node, i) => {
      const direction = i % 4 === 0 ? "left" : i % 4 === 2 ? "right" : "up";
      node.dataset.revealDirection = direction;
      node.classList.add("ts-scroll-reveal");
      if (node.getBoundingClientRect().top < window.innerHeight * 0.95) {
        node.classList.add("ts-reveal-visible");
      } else {
        observer.observe(node);
      }
    });
    return () => observer.disconnect();
  }, []);
  return null;
}
