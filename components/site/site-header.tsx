"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, MapPin, Menu, X } from "lucide-react";
import { Logo } from "./brand";

type SiteHeaderProps = {
  home?: boolean;
};

export function SiteHeader({ home = false }: SiteHeaderProps) {
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sectionHref = (section: string) => `${home ? "" : "/"}#${section}`;

  useEffect(() => {
    if (!menu) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menu]);

  return (
    <>
      <div className="topline">
        <span>COMMERCIAL TILING. CONSIDERED FROM EVERY ANGLE.</span>
        <span className="topline-right"><MapPin size={13} /> NORTH WEST BASED · UK PROJECTS</span>
      </div>
      <header className="site-header">
        <div className="shell nav">
          <Logo home={home} />
          <nav id="main-navigation" className={menu ? "nav-links open" : "nav-links"} aria-label="Main navigation">
            <a href={sectionHref("expertise")} onClick={() => setMenu(false)}>Expertise</a>
            <a href={sectionHref("approach")} onClick={() => setMenu(false)}>Our approach</a>
            <a href={sectionHref("projects")} onClick={() => setMenu(false)}>Projects</a>
            <a href={sectionHref("about")} onClick={() => setMenu(false)}>About</a>
            <a className="mobile-cta" href={sectionHref("tender")} onClick={() => setMenu(false)}>Discuss a project <ArrowUpRight size={16} /></a>
          </nav>
          <a className="nav-cta" href={sectionHref("tender")}>SEND AN ENQUIRY <ArrowUpRight size={17} /></a>
          <button
            ref={menuButton}
            type="button"
            className="menu-button"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            aria-controls="main-navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
    </>
  );
}
