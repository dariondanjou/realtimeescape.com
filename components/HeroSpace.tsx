/**
 * Full-bleed hero backdrop — Earth's limb from orbit, keynote-style.
 *
 * Inline SVG with preserveAspectRatio="slice" so it covers the hero wall-to-wall at
 * any viewport, stays razor sharp at any resolution, and ships zero image bytes.
 * The planet sits low so the slogan floats in clean black space above the glow.
 */
export default function HeroSpace() {
  return (
    <svg
      className="hero-space"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="Earth seen from orbit, its atmosphere glowing blue against black space"
    >
      <defs>
        <radialGradient id="hsEarth" cx="50%" cy="18%" r="95%">
          <stop offset="0%" stopColor="#3f8fc4" />
          <stop offset="24%" stopColor="#1f639c" />
          <stop offset="55%" stopColor="#0d3a63" />
          <stop offset="100%" stopColor="#021527" />
        </radialGradient>
        <linearGradient id="hsAtmo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9fe0ff" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#58c3f7" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#1e93dd" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hsGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e93dd" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#1e93dd" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="hsSpace" cx="50%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#070b10" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
      </defs>

      <rect width="1600" height="900" fill="url(#hsSpace)" />

      {/* stars — hand-placed, denser toward the top where the slogan is not */}
      <g fill="#dcecf7">
        <circle cx="112" cy="96" r="1.3" opacity="0.8" />
        <circle cx="273" cy="182" r="0.9" opacity="0.55" />
        <circle cx="391" cy="74" r="1.1" opacity="0.7" />
        <circle cx="520" cy="203" r="0.8" opacity="0.5" />
        <circle cx="628" cy="118" r="1.4" opacity="0.85" />
        <circle cx="742" cy="61" r="0.9" opacity="0.6" />
        <circle cx="866" cy="167" r="1.0" opacity="0.6" />
        <circle cx="984" cy="92" r="1.3" opacity="0.8" />
        <circle cx="1108" cy="196" r="0.8" opacity="0.5" />
        <circle cx="1219" cy="83" r="1.1" opacity="0.7" />
        <circle cx="1341" cy="152" r="0.9" opacity="0.55" />
        <circle cx="1462" cy="99" r="1.4" opacity="0.85" />
        <circle cx="1538" cy="214" r="0.9" opacity="0.55" />
        <circle cx="176" cy="286" r="1.0" opacity="0.6" />
        <circle cx="334" cy="342" r="0.8" opacity="0.45" />
        <circle cx="468" cy="291" r="1.2" opacity="0.7" />
        <circle cx="619" cy="356" r="0.7" opacity="0.4" />
        <circle cx="787" cy="309" r="1.0" opacity="0.6" />
        <circle cx="948" cy="371" r="0.8" opacity="0.45" />
        <circle cx="1096" cy="318" r="1.2" opacity="0.7" />
        <circle cx="1247" cy="365" r="0.7" opacity="0.4" />
        <circle cx="1409" cy="304" r="1.0" opacity="0.6" />
        <circle cx="88" cy="428" r="0.9" opacity="0.5" />
        <circle cx="243" cy="474" r="0.7" opacity="0.4" />
        <circle cx="1352" cy="462" r="0.9" opacity="0.5" />
        <circle cx="1512" cy="418" r="0.7" opacity="0.4" />
        <circle cx="56" cy="181" r="0.8" opacity="0.5" />
        <circle cx="702" cy="242" r="0.8" opacity="0.5" />
        <circle cx="1173" cy="246" r="0.9" opacity="0.55" />
        <circle cx="905" cy="235" r="0.7" opacity="0.45" />
      </g>

      {/* upper glow so the black is not dead flat */}
      <rect width="1600" height="420" fill="url(#hsGlow)" opacity="0.25" />

      {/* Earth limb — a planet far larger than the frame, cresting the bottom edge so
          the slogan and buttons float in clean black space above it */}
      <circle cx="800" cy="2420" r="1660" fill="url(#hsEarth)" />

      {/* clouds hugging the limb */}
      <g fill="#eef8fe" opacity="0.13">
        <ellipse cx="450" cy="836" rx="190" ry="13" transform="rotate(-6 450 836)" />
        <ellipse cx="830" cy="792" rx="250" ry="12" transform="rotate(-1 830 792)" />
        <ellipse cx="1220" cy="846" rx="180" ry="12" transform="rotate(5 1220 846)" />
      </g>

      {/* the atmosphere line — the hero's single brightest element, concentric with the limb */}
      <circle cx="800" cy="2420" r="1712" fill="none" stroke="url(#hsAtmo)" strokeWidth="105" opacity="0.16" />
      <circle cx="800" cy="2420" r="1666" fill="none" stroke="url(#hsAtmo)" strokeWidth="9" opacity="0.9" />
      <circle cx="800" cy="2420" r="1662" fill="none" stroke="#c9ecff" strokeWidth="2" opacity="0.85" />
    </svg>
  );
}
