type LogoProps = {
  light?: boolean;
  home?: boolean;
};

/** The approved TileSPEC SVG and its existing display styles. */
export function Logo({ light = false, home = false }: LogoProps) {
  return (
    <a
      className={"brand brand-svg" + (light ? " brand-light" : "")}
      href={home ? "#top" : "/"}
      aria-label="TileSPEC home"
    >
      <img src="/tilespec-logo-animated.svg" alt="TileSPEC Commercial Tiling" width="280" height="75" />
    </a>
  );
}
