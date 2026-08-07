/**
 * Hero artwork — the passenger viewing lounge of the CSV Meridian, looking out.
 *
 * Built from the Moon Knight visual DNA in docs/BURN_WINDOW_VISUAL_BIBLE.md: rigorous bilateral
 * symmetry, repeating bays receding to a vanishing point, a glossy floor that doubles the room,
 * cold light through the glazing, and exactly three warm pendant lamps as the only warmth in an
 * otherwise cold space. Lifted blacks throughout — nothing in this room hides in shadow, which is
 * what makes it feel exposed rather than cosy.
 *
 * Inline SVG rather than a raster asset: it costs no network request, stays sharp at any size,
 * and reads correctly at the small end where a photograph would turn to mush.
 */
export default function HeroArt({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 900 620"
      className={className}
      role="img"
      aria-label="The passenger viewing lounge of a spacecraft, looking down a symmetrical hall of
                  windows toward Earth"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <defs>
        {/* Earth through the far window */}
        <radialGradient id="earth" cx="42%" cy="34%" r="76%">
          <stop offset="0%" stopColor="#9ad9f7" />
          <stop offset="38%" stopColor="#4a9fd0" />
          <stop offset="72%" stopColor="#1f5f92" />
          <stop offset="100%" stopColor="#0d3355" />
        </radialGradient>

        <radialGradient id="atmosphere" cx="42%" cy="34%" r="62%">
          <stop offset="70%" stopColor="#7fd4f5" stopOpacity="0" />
          <stop offset="90%" stopColor="#7fd4f5" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#7fd4f5" stopOpacity="0" />
        </radialGradient>

        {/* Cold daylight spilling in from the far window */}
        <radialGradient id="windowGlow" cx="50%" cy="46%" r="58%">
          <stop offset="0%" stopColor="#a9dcf6" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#5aa9d4" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#35a8dc" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7f95a8" />
          <stop offset="60%" stopColor="#68809a" />
          <stop offset="100%" stopColor="#55697f" />
        </linearGradient>

        <linearGradient id="ceiling" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4d6076" />
          <stop offset="100%" stopColor="#7590a8" />
        </linearGradient>

        {/* Polished floor — the location's signature. Reflects the room back at itself. */}
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8fabc4" />
          <stop offset="30%" stopColor="#6f8ba6" />
          <stop offset="100%" stopColor="#3f5568" />
        </linearGradient>

        <linearGradient id="reflection" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a9dcf6" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#a9dcf6" stopOpacity="0" />
        </linearGradient>

        <radialGradient id="lamp">
          <stop offset="0%" stopColor="#ffd9bd" />
          <stop offset="45%" stopColor="#e6946d" />
          <stop offset="100%" stopColor="#e6946d" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="fadeOut" x1="0" y1="0" x2="0" y2="1">
          <stop offset="60%" stopColor="#000" stopOpacity="1" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <mask id="bottomFade">
          <rect x="0" y="0" width="900" height="620" fill="url(#fadeOut)" />
        </mask>
      </defs>

      <g mask="url(#bottomFade)">
        {/* --- Room shell, one-point perspective on the centre axis --- */}
        <rect x="0" y="0" width="900" height="620" fill="#43586c" />

        {/* Ceiling plane */}
        <polygon points="0,0 900,0 620,208 280,208" fill="url(#ceiling)" />

        {/* Side walls */}
        <polygon points="0,0 280,208 280,404 0,620" fill="url(#wall)" />
        <polygon points="900,0 620,208 620,404 900,620" fill="url(#wall)" />

        {/* Floor plane */}
        <polygon points="0,620 280,404 620,404 900,620" fill="url(#floor)" />

        {/* Far bulkhead with the great window */}
        <rect x="280" y="208" width="340" height="196" fill="#59718a" />

        {/* --- The window and Earth --- */}
        <g>
          <rect x="308" y="230" width="284" height="152" rx="6" fill="#0a1725" />
          {/* stars */}
          <g fill="#cfe8f7">
            <circle cx="340" cy="252" r="1.1" opacity="0.8" />
            <circle cx="372" cy="300" r="0.9" opacity="0.6" />
            <circle cx="560" cy="262" r="1.2" opacity="0.75" />
            <circle cx="536" cy="342" r="0.8" opacity="0.5" />
            <circle cx="410" cy="246" r="0.7" opacity="0.55" />
            <circle cx="580" cy="318" r="0.9" opacity="0.6" />
          </g>
          {/* Earth limb, sitting low and off-centre — the ship is drifting */}
          <circle cx="470" cy="372" r="132" fill="url(#earth)" />
          <circle cx="470" cy="372" r="140" fill="url(#atmosphere)" />
          {/* cloud banding, deliberately soft and non-literal */}
          <g fill="#dff2fb" opacity="0.22">
            <ellipse cx="432" cy="318" rx="46" ry="9" />
            <ellipse cx="512" cy="340" rx="34" ry="7" />
            <ellipse cx="452" cy="356" rx="58" ry="8" />
          </g>
          <rect x="308" y="230" width="284" height="152" rx="6" fill="none" stroke="#8fabc4" strokeWidth="3" />
          {/* multi-layer glazing seal — shared ship detail from the visual bible */}
          <rect x="313" y="235" width="274" height="142" rx="4" fill="none" stroke="#b9d2e4" strokeWidth="1" opacity="0.5" />
        </g>

        {/* Cold light washing back into the room from the window */}
        <ellipse cx="450" cy="330" rx="440" ry="300" fill="url(#windowGlow)" />

        {/* --- Repeating door bays, both sides, receding --- */}
        {[0, 1, 2, 3].map((i) => {
          const t = i / 4;
          const nx = 280 * (1 - t);           // near x on the left wall
          const fx = 280 * (1 - (i + 1) / 4);
          const nyTop = 208 * t;
          const fyTop = 208 * (i + 1) / 4;
          const nyBot = 620 - (620 - 404) * t;
          const fyBot = 620 - (620 - 404) * (i + 1) / 4;
          const shade = 0.1 + i * 0.05;
          return (
            <g key={i}>
              {/* left bay */}
              <polygon
                points={`${nx},${nyTop} ${fx},${fyTop} ${fx},${fyBot} ${nx},${nyBot}`}
                fill="#7d97ad"
                opacity={shade}
              />
              <line x1={fx} y1={fyTop} x2={fx} y2={fyBot} stroke="#a7c2d6" strokeWidth="1.5" opacity="0.55" />
              {/* right bay, mirrored */}
              <polygon
                points={`${900 - nx},${nyTop} ${900 - fx},${fyTop} ${900 - fx},${fyBot} ${900 - nx},${nyBot}`}
                fill="#7d97ad"
                opacity={shade}
              />
              <line x1={900 - fx} y1={fyTop} x2={900 - fx} y2={fyBot} stroke="#a7c2d6" strokeWidth="1.5" opacity="0.55" />
            </g>
          );
        })}

        {/* Ceiling coffers */}
        {[0, 1, 2].map((i) => {
          const t = (i + 1) / 4;
          const y = 208 * t;
          const x1 = 280 * t;
          return (
            <line
              key={i}
              x1={x1} y1={y} x2={900 - x1} y2={y}
              stroke="#93aec4" strokeWidth="1.5" opacity="0.4"
            />
          );
        })}

        {/* --- Three warm pendant lamps on the centre axis --- */}
        {[
          { y: 132, r: 13 },
          { y: 168, r: 10 },
          { y: 194, r: 7.5 },
        ].map((l, i) => (
          <g key={i}>
            <line x1="450" y1={l.y - 40} x2="450" y2={l.y} stroke="#8fa8bd" strokeWidth="1" opacity="0.6" />
            <circle cx="450" cy={l.y} r={l.r * 3.4} fill="url(#lamp)" opacity="0.42" />
            <circle cx="450" cy={l.y} r={l.r} fill="#ffcfae" />
          </g>
        ))}

        {/* --- A lone figure, small, deep in the space --- */}
        <g opacity="0.9">
          <ellipse cx="450" cy="404" rx="17" ry="4" fill="#2c3f52" opacity="0.35" />
          <circle cx="450" cy="352" r="7" fill="#c9dced" />
          <path d="M441 361 q9 -5 18 0 l3 34 q-12 5 -24 0 z" fill="#dceaf5" />
          <rect x="444" y="393" width="5" height="13" fill="#c3d7e8" />
          <rect x="452" y="393" width="5" height="13" fill="#c3d7e8" />
        </g>

        {/* --- Floor reflection: the room, doubled --- */}
        <g transform="translate(0,808) scale(1,-1)" opacity="0.34">
          <rect x="308" y="230" width="284" height="152" rx="6" fill="#0e2438" />
          <circle cx="470" cy="372" r="132" fill="url(#earth)" opacity="0.72" />
          {[
            { y: 132, r: 13 },
            { y: 168, r: 10 },
            { y: 194, r: 7.5 },
          ].map((l, i) => (
            <circle key={i} cx="450" cy={l.y} r={l.r * 2.6} fill="url(#lamp)" opacity="0.4" />
          ))}
          <circle cx="450" cy="360" r="8" fill="#c9dced" opacity="0.6" />
        </g>
        <polygon points="0,620 280,404 620,404 900,620" fill="url(#reflection)" />

        {/* Depth haze at the far end — genuine in the reference, so reproduced */}
        <rect x="280" y="208" width="340" height="196" fill="#7fa8c4" opacity="0.09" />
      </g>
    </svg>
  );
}
