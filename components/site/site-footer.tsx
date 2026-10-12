import { ArrowUpRight } from "lucide-react";
import { Logo } from "./brand";

type SiteFooterProps = {
  home?: boolean;
  showCommercialHub?: boolean;
};

export function SiteFooter({ home = false, showCommercialHub = false }: SiteFooterProps) {
  const sectionHref = (section: string) => `${home ? "" : "/"}#${section}`;

  return (
    <footer>
      <div className="shell">
        <div className="footer-main">
          <div>
            <Logo light home={home} />
            <p>Commercial wall and floor tiling packages for contractors and businesses.</p>
          </div>
          <div>
            <span>EXPLORE</span>
            <a href={sectionHref("expertise")}>Expertise</a>
            {showCommercialHub && <a href="/commercial-tiling">Commercial tiling</a>}
            <a href={sectionHref("approach")}>Our approach</a>
            <a href={sectionHref("projects")}>Projects</a>
            <a href={sectionHref("tender")}>Enquiries</a>
          </div>
          <div>
            <span>RELATED BRAND</span>
            <a href="https://resinspec.uk" target="_blank" rel="noopener noreferrer">ResinSpec Flooring <ArrowUpRight size={14} /></a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} TileSPEC. Commercial Tiling Contractors.</span>
          <span>COMMERCIAL WALL & FLOOR TILING.</span>
          <a href="#top">BACK TO TOP ↑</a>
        </div>
      </div>
    </footer>
  );
}
