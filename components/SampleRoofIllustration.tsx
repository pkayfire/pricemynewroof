// Landing hero: a drawn sample roof with plane markers. It's an illustration, never real
// satellite imagery and never Solar API data (docs/SPEC.md "Landing hero visual").
// Letters run strictly largest plane first (Build decisions, mockup fixes).

interface SampleMarker {
  x: number;
  y: number;
  letter: string;
  pitch: string;
  /** Downhill direction in degrees clockwise from north (up). */
  azimuth: number;
}

const MARKERS: SampleMarker[] = [
  { x: 187, y: 89, letter: "A", pitch: "6/12", azimuth: 0 }, // main front, 520 sq ft
  { x: 187, y: 185, letter: "B", pitch: "6/12", azimuth: 180 }, // main back, 520 sq ft
  { x: 387, y: 115, letter: "C", pitch: "4/12", azimuth: 0 }, // garage, 260 sq ft
  { x: 387, y: 175, letter: "D", pitch: "4/12", azimuth: 180 }, // garage, 260 sq ft
  { x: 84, y: 137, letter: "E", pitch: "6/12", azimuth: 270 }, // hip end, 210 sq ft
  { x: 290, y: 137, letter: "F", pitch: "6/12", azimuth: 90 }, // hip end, 210 sq ft
];

function Marker({ m }: { m: SampleMarker }) {
  const ax = m.x + 78;
  const ay = m.y + 15;
  return (
    <g>
      <rect x={m.x} y={m.y} width="96" height="30" rx="15" fill="#FFFFFF" stroke="#2F6FD0" strokeWidth="1.5" />
      <text
        x={m.x + 10}
        y={m.y + 20}
        fontFamily="var(--font-barlow-sc), Barlow Semi Condensed, sans-serif"
        fontWeight="700"
        fontSize="17"
        fill="#22262A"
      >
        {m.letter}
      </text>
      <text x={m.x + 28} y={m.y + 20} fontFamily="var(--font-barlow), Barlow, sans-serif" fontSize="14" fill="#2F6FD0">
        {m.pitch}
      </text>
      <path
        transform={`translate(${ax} ${ay}) rotate(${m.azimuth})`}
        d="M0 6 V-6 M-4 -2 L0 -6 L4 -2"
        fill="none"
        stroke="#22262A"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

export function SampleRoofIllustration() {
  return (
    <svg
      viewBox="0 0 560 330"
      width="100%"
      role="img"
      aria-label="Drawing of a sample roof with each plane labeled by pitch and an arrow showing which way it slopes"
    >
      <rect x="0" y="0" width="560" height="330" fill="#3B4247" />
      <rect x="0" y="290" width="560" height="40" fill="#2E3438" />
      <rect x="18" y="30" width="60" height="230" fill="#4A5357" />
      <rect x="500" y="20" width="48" height="250" fill="#4A5357" />
      <circle cx="70" cy="290" r="28" fill="#41503F" />
      <circle cx="510" cy="50" r="34" fill="#41503F" />
      <circle cx="120" cy="252" r="22" fill="#41503F" />
      <polygon points="90,60 380,60 290,150 180,150" fill="#73787C" />
      <polygon points="90,240 380,240 290,150 180,150" fill="#5A5F63" />
      <polygon points="90,60 180,150 90,240" fill="#666B6F" />
      <polygon points="380,60 290,150 380,240" fill="#62676B" />
      <rect x="380" y="100" width="110" height="60" fill="#6E7377" />
      <rect x="380" y="160" width="110" height="60" fill="#575C60" />
      {MARKERS.map((m) => (
        <Marker key={m.letter} m={m} />
      ))}
    </svg>
  );
}
