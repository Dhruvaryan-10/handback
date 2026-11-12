/**
 * Illustrated camera used on the landing page. Clearly labelled as an illustration in the UI:
 * it is not a real inspection result.
 */
function camera(withNewDamage: boolean) {
  const crack = withNewDamage
    ? `<g stroke="#f3efe6" stroke-width="3.2" stroke-linecap="round" fill="none" opacity=".92">
         <path d="M548 318 L572 340 L566 362 L590 384"/>
         <path d="M572 340 L596 336"/>
       </g>
       <circle cx="262" cy="452" r="9" fill="#d9d2c4"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e4da"/><stop offset="1" stop-color="#d8d1c3"/></linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3d42"/><stop offset="1" stop-color="#1f2125"/></linearGradient>
    <radialGradient id="glass" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#5b6b7d"/><stop offset=".55" stop-color="#1b232c"/><stop offset="1" stop-color="#0c1015"/></radialGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <ellipse cx="400" cy="508" rx="290" ry="26" fill="#000" opacity=".16"/>
  <rect x="150" y="190" width="500" height="300" rx="34" fill="url(#body)"/>
  <rect x="190" y="150" width="130" height="58" rx="12" fill="#2b2e33"/>
  <rect x="540" y="160" width="62" height="34" rx="8" fill="#2b2e33"/>
  <rect x="150" y="250" width="500" height="22" fill="#2a2d31"/>
  <rect x="170" y="215" width="70" height="20" rx="4" fill="#4a4e55"/>
  <circle cx="420" cy="345" r="122" fill="#17191c"/>
  <circle cx="420" cy="345" r="104" fill="#2c3036"/>
  <circle cx="420" cy="345" r="82" fill="url(#glass)"/>
  <circle cx="392" cy="318" r="18" fill="#fff" opacity=".18"/>
  <g stroke="#7c8088" stroke-width="2.4" stroke-linecap="round" opacity=".85">
    <path d="M206 300 L246 318"/><path d="M212 314 L238 326"/>
  </g>
  ${crack}
</svg>`;
}

const uri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const demoBefore = uri(camera(false));
export const demoAfter = uri(camera(true));

/** Boxes drawn by hand for the illustration (0-1000 grid). */
export const demoExisting = [
  { label: 'Scuff on left grip', type: 'scratch', severity: 'minor' as const, box_2d: [470, 245, 570, 330], confidence: 0.86 },
];
export const demoFound = [
  { label: 'Crack on lens ring', type: 'crack', severity: 'moderate' as const, box_2d: [505, 670, 665, 765], confidence: 0.91, amountCents: 4500 },
  { label: 'Chip on lower body', type: 'stain', severity: 'minor' as const, box_2d: [728, 308, 783, 350], confidence: 0.54, needsReview: true, amountCents: 0 },
];
