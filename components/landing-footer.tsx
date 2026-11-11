import Link from "next/link";

export default function LandingFooter() {
  return <footer>
    <div className="shell">
      <div className="footer-main">
        <div>
          <Link className="brand brand-svg brand-light" href="/" aria-label="TileSPEC homepage"><img src="/tilespec-logo-animated.svg" alt="TileSPEC Commercial Tiling" width={280} height={75}/></Link>
          <p>Commercial wall and floor tiling packages for contractors and businesses.</p>
        </div>
        <div>
          <span>Explore</span>
          <Link href="/#expertise">Expertise</Link>
          <Link href="/#approach">Our approach</Link>
          <Link href="/#projects">Projects</Link>
          <Link href="/coverage">UK coverage</Link>
          <Link href="/guides">Technical guidance</Link>
          <Link href="/services/commercial-tiling-packages">Complete tiling packages</Link>
          <Link href="/contact">Enquiries</Link>
        </div>
        <div>
          <span>Contact</span>
          <a href="tel:+443333393445">0333 339 3445</a>
          <a href="mailto:info@tilespec.uk">info@tilespec.uk</a>
          <Link href="/privacy">Privacy policy</Link>
          <span style={{display:"block",marginTop:"12px"}}>Address</span>
          <address style={{fontStyle:"normal",lineHeight:1.7}}>Warrington, Cheshire, UK</address>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} TileSPEC. A trading name of SPEC CONTRACTING LTD · Registered in England and Wales · Company no. 17574891.</span>
        <span>COMMERCIAL WALL & FLOOR TILING.</span>
        <a href="#top">BACK TO TOP ↑</a>
      </div>
    </div>
  </footer>;
}
