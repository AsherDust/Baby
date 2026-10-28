(function () {
  'use strict';
  const Baby = globalThis.Baby || (globalThis.Baby = {});

  const INK = '#6B4A2E';
  const svg = (viewBox, inner) =>
    `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;

  const HONEY_POT = `
    <path d="M19 23C10.5 27.5 7 36 8.8 44.5 10.8 53.5 19.8 58 32 58s21.2-4.5 23.2-13.5C57 36 53.5 27.5 45 23z" fill="#EBAA3F" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M20 23.5H44V26C44 27.6 43.1 28.5 42 28.5S40 27.6 40 26V25.5C40 29.5 38.6 32 37 32S34 29.5 34 25.5C34 27.5 33 28.6 31.8 28.6S29.6 27.5 29.6 25.5V25C29.6 30.5 28 33.5 26 33.5S22.4 30.5 22.4 25C22.4 26.6 21.4 27.4 20 27.4Z" fill="#F7CD6B"/>
    <ellipse cx="25.2" cy="30" rx="0.8" ry="1.4" fill="#FFF3D0"/>
    <path d="M14.5 36c-1.3 4.6-.6 9.4 2.4 12.8" fill="none" stroke="#FFF1CC" stroke-width="3" stroke-linecap="round" opacity=".75"/>
    <rect x="14.5" y="14.5" width="35" height="9.5" rx="4.75" fill="#F4C565" stroke="${INK}" stroke-width="2.2"/>
    <g transform="rotate(-5 32 44)">
      <rect x="23" y="38" width="18" height="12" rx="2.5" fill="#FFF8E7" stroke="${INK}" stroke-width="1.6"/>
      <path d="M32 47.2l-3.3-3.2a2 2 0 0 1 3.3-2.2 2 2 0 0 1 3.3 2.2z" fill="#C0563F"/>
    </g>`;

  const BEE = `
    <ellipse cx="16" cy="9" rx="6" ry="4.2" transform="rotate(-25 16 9)" fill="#FFFFFF" fill-opacity=".92" stroke="${INK}" stroke-width="1.4"/>
    <ellipse cx="23.5" cy="8.5" rx="5.4" ry="3.8" transform="rotate(20 23.5 8.5)" fill="#FFFFFF" fill-opacity=".92" stroke="${INK}" stroke-width="1.4"/>
    <ellipse cx="20" cy="18.5" rx="11" ry="8" fill="#F4C24F" stroke="${INK}" stroke-width="1.6"/>
    <path d="M15.5 11.3c-1.4 4.4-1.4 10 0 14.4M21.3 10.6c-1.4 4.6-1.4 11.2 0 15.8" fill="none" stroke="${INK}" stroke-width="2.6"/>
    <circle cx="27.4" cy="16.6" r="1.25" fill="${INK}"/>
    <ellipse cx="28.4" cy="20.2" rx="1.6" ry="1" fill="#E98B6D" opacity=".55"/>
    <path d="M9.2 17.6L6 18.5l3.2 1" fill="${INK}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M27 12.9c1-2.6 2.8-4 5-4.3" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`;

  const SWEAT = (x, y) =>
    `<path d="M${x} ${y}c-1.2 1.7-1.6 2.8-1.6 3.4a1.6 1.6 0 0 0 3.2 0c0-.6-.4-1.7-1.6-3.4z" fill="#9CC9E8" stroke="${INK}" stroke-width=".9"/>`;

  // 心情小脸：32×32，圆脸 + 五官，配色按心情
  const FACE = (fill, inner, cheeks = true) => `
    <circle cx="16" cy="16.5" r="12.5" fill="${fill}" stroke="${INK}" stroke-width="1.6"/>
    ${cheeks ? '<ellipse cx="9.4" cy="19.6" rx="2.1" ry="1.3" fill="#E98B6D" opacity=".5"/><ellipse cx="22.6" cy="19.6" rx="2.1" ry="1.3" fill="#E98B6D" opacity=".5"/>' : ''}
    <g fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  const EYES = `<circle cx="12" cy="14.6" r="1.4" fill="${INK}" stroke="none"/><circle cx="20" cy="14.6" r="1.4" fill="${INK}" stroke="none"/>`;
  const MOOD_FACES = {
    happy: FACE('#F6C858', `<path d="M10.2 15c.8-1.7 2.8-1.7 3.6 0M18.2 15c.8-1.7 2.8-1.7 3.6 0"/><path d="M11.6 18.6c1.2 3.6 7.6 3.6 8.8 0z" fill="${INK}"/>`),
    calm: FACE('#B5D3A4', '<path d="M10.2 14.4c.8 1.4 2.8 1.4 3.6 0M18.2 14.4c.8 1.4 2.8 1.4 3.6 0"/><path d="M13 20c1.6 1.4 4.4 1.4 6 0"/>'),
    excited: FACE('#F7AE8E', `<circle cx="12" cy="14.2" r="1.9" fill="${INK}" stroke="none"/><circle cx="20" cy="14.2" r="1.9" fill="${INK}" stroke="none"/><circle cx="12.7" cy="13.5" r=".6" fill="#FFF" stroke="none"/><circle cx="20.7" cy="13.5" r=".6" fill="#FFF" stroke="none"/><path d="M12.2 18.4h7.6c0 2.9-1.7 4.4-3.8 4.4s-3.8-1.5-3.8-4.4z" fill="${INK}"/><path d="M27.2 1.8l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z" fill="#F2B544" stroke-width="1"/>`),
    tired: FACE('#CDBFE6', '<path d="M10.2 15.4h3.6M18.2 15.4h3.6"/><ellipse cx="16" cy="21" rx="1.6" ry="1.8"/><path d="M23.6 3.6h3.2l-3.2 3.6h3.2" stroke-width="1.3"/>', false),
    low: FACE('#A9C4DC', `${EYES}<path d="M12.4 21.6c1.9-2 5.3-2 7.2 0"/><path d="M9.6 17.4c-.9 1.3-1.2 2.2-1.2 2.7a1.2 1.2 0 0 0 2.4 0c0-.5-.3-1.4-1.2-2.7z" fill="#7FB2DA" stroke-width="1"/>`, false),
    anxious: FACE('#EDBBC8', `${EYES}<path d="M9.6 11.8l3.4-1.3M22.4 11.8L19 10.5"/><path d="M11.4 20.8c.9-1 1.8-1 2.3 0s1.4 1 2.3 0 1.4-1 2.3 0 1.4 1 2.3 0"/>${SWEAT(26.4, 5.4)}`, false),
  };

  const BURST_BITS = {
    heart: '<path d="M8 14L2.6 8.9A3.2 3.2 0 0 1 8 4.6a3.2 3.2 0 0 1 5.4 4.3z" fill="#EC8A70"/>',
    drop: '<path d="M8 1.8c2.6 3.4 4.4 5.9 4.4 8.2a4.4 4.4 0 0 1-8.8 0c0-2.3 1.8-4.8 4.4-8.2z" fill="#F2B544"/><path d="M6.2 10.6a1.9 1.9 0 0 0 1.6 1.8" stroke="#FFF1CC" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
  };

  const BALLOON_BODY = `
    <path d="M15 2.5C8.1 2.5 3 7.9 3 14.6c0 7.6 6.3 14.2 12 15.6 5.7-1.4 12-8 12-15.6C27 7.9 21.9 2.5 15 2.5z" fill="#93B6CC" stroke="${INK}" stroke-width="1.5"/>
    <path d="M9.2 9.6c-1.6 2-2.2 4.4-1.8 6.6" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>
    <path d="M13.4 30.6h3.2L15 33.2z" fill="#93B6CC" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`;
  const BALLOON_STRING = `<path d="M15 33.2c-2.4 3.6 2.4 6 0 9.6s2 5 0 8.4" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>`;

  function hexPath(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 180) * (60 * i - 90);
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return `M${pts.join('L')}Z`;
  }

  const COMB_CELLS = [
    [30, 16], [54.5, 16, 1], [79, 16], [103.5, 16],
    [42.3, 37.2], [66.8, 37.2], [91.3, 37.2, 1], [115.8, 37.2],
    [54.5, 58.4], [79, 58.4, 1], [103.5, 58.4],
    [91.3, 79.6], [115.8, 79.6],
  ];
  const HONEYCOMB = COMB_CELLS.map(([x, y, filled]) =>
    `<path d="${hexPath(x, y, 12.5)}" fill="${filled ? '#F6D58E' : 'none'}" fill-opacity=".55" stroke="#E2B867" stroke-width="1.3" stroke-opacity=".7"/>`
  ).join('');

  const SCENE = `
    <circle class="art-sun" cx="74" cy="56" r="22" fill="#FBE3A6" opacity=".55"/>
    <path class="art-hill" d="M0 158C52 128 118 124 178 138S296 158 360 134V210H0z" fill="#EEF2E1"/>
    <path class="art-hill-near" d="M0 182C72 160 152 158 222 170S322 186 360 176V210H0z" fill="#E0E9D0"/>
    <path d="M258 178c3-24 2-46-7-68" fill="none" stroke="#8C6A47" stroke-width="10" stroke-linecap="round"/>
    <path d="M255 136c11-7 22-9 33-9" fill="none" stroke="#8C6A47" stroke-width="5.5" stroke-linecap="round"/>
    <circle cx="234" cy="88" r="31" fill="#A9C193"/>
    <circle cx="272" cy="80" r="35" fill="#93AF7E"/>
    <circle cx="250" cy="57" r="27" fill="#B6CCA1"/>
    <path d="M226 72c4-3 9-4 13-3M263 60c5-2 10-2 14 0" fill="none" stroke="#D4E2C4" stroke-width="3" stroke-linecap="round"/>
    <path d="M288 127c6-14-6-22 4-34s8-14 20-24" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>
    <g transform="translate(297 36)">${BALLOON_BODY}</g>
    <g fill="none" stroke="#A9C193" stroke-width="1.6" stroke-linecap="round">
      <path d="M96 176c1-5 2-7 2-10M101 176c0-4 2-6 4-8M320 182c1-4 2-6 2-9M325 182c0-3 2-5 3-7"/>
    </g>
    <g fill="#F1C3AE"><circle cx="64" cy="180" r="3"/><circle cx="132" cy="172" r="2.4"/><circle cx="306" cy="184" r="2.6"/></g>
    <g fill="#F4C565"><circle cx="76" cy="186" r="2.2"/><circle cx="216" cy="182" r="2.6"/></g>
    <g>
      <circle cx="171" cy="111" r="7.5" fill="#E3A548" stroke="${INK}" stroke-width="2"/>
      <circle cx="171" cy="111" r="3.5" fill="#F6D29A"/>
      <circle cx="199" cy="111" r="7.5" fill="#E3A548" stroke="${INK}" stroke-width="2"/>
      <circle cx="199" cy="111" r="3.5" fill="#F6D29A"/>
      <circle cx="185" cy="126" r="19" fill="#E8AE55" stroke="${INK}" stroke-width="2"/>
      <circle cx="178.5" cy="122.5" r="2" fill="${INK}"/>
      <circle cx="191.5" cy="122.5" r="2" fill="${INK}"/>
      <ellipse cx="185" cy="131" rx="6.5" ry="4.5" fill="#F6D9A6"/>
      <ellipse cx="185" cy="129" rx="2.4" ry="1.7" fill="${INK}"/>
    </g>
    <g transform="translate(153 118)">${HONEY_POT}</g>
    <path d="M44 104c24-30 62-32 84-12s52 16 68-8" fill="none" stroke="#D6A24A" stroke-width="1.6" stroke-dasharray="1 7" stroke-linecap="round"/>
    <g transform="translate(192 66)">${BEE}</g>
    <g transform="translate(112 22) scale(.62)">${BEE}</g>`;

  const icon = (d, width = 1.8) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;

  const icons = {
    scale: icon('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M8.2 10a4.6 4.6 0 0 1 7.6 0"/><path d="M12 10.2l1.6-2.1"/>'),
    calendarHeart: icon('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.8h17M8 3v4M16 3v4"/><path d="M12 18l-2.6-2.5a1.6 1.6 0 0 1 2.6-1.9 1.6 1.6 0 0 1 2.6 1.9z"/>'),
    calendarPlus: icon('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.8h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5"/>'),
    leaf: icon('<path d="M5 19.5C5 11 10.5 5 19.5 4.5 19.5 13.5 13.5 19 5 19.5z"/><path d="M5 19.5l8-8"/>'),
    sliders: icon('<path d="M4 7h9.5M18.5 7H20M4 17h3.5M12.5 17H20"/><circle cx="16" cy="7" r="2.5"/><circle cx="10" cy="17" r="2.5"/>'),
    bell: icon('<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    plus: icon('<path d="M12 5.5v13M5.5 12h13"/>'),
    check: icon('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6),
    x: icon('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
    download: icon('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>'),
    bag: icon('<path d="M5 8.5h14l-1 11.5H6z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>'),
    suitcase: icon('<rect x="3.5" y="7.5" width="17" height="12.5" rx="3.2"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/><path d="M12 16.8l-2.3-2.2a1.4 1.4 0 0 1 2.3-1.7 1.4 1.4 0 0 1 2.3 1.7z"/>'),
    clock: icon('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    pill: icon('<g transform="rotate(-35 12 12)"><rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M12 8.5v7"/></g>'),
    feet: icon('<ellipse cx="8" cy="16.6" rx="2.6" ry="3.9" transform="rotate(-8 8 16.6)"/><path d="M5.7 10.8h0M7.4 10.1h0M9.1 10.2h0M10.5 11.1h0"/><ellipse cx="16" cy="9.4" rx="2.6" ry="3.9" transform="rotate(8 16 9.4)"/><path d="M13.6 3.9h0M15.2 3.1h0M16.9 3.2h0M18.4 4h0"/>'),
    timer: icon('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.6M10 2.8h4M12 2.8V6M18.4 6.6l1.4-1.4"/>'),
    bowl: icon('<path d="M3.5 11.5h17a8.5 7 0 0 1-17 0z"/><path d="M9 20.5h6M9.2 8.2c0-1.6 1.6-1.6 1.6-3.2M13.4 8.2c0-1.6 1.6-1.6 1.6-3.2"/>'),
    pot: icon('<path d="M3.5 10h17M10 7.6a2 2 0 0 1 4 0"/><path d="M5.5 10v6a4 4 0 0 0 4 4h5a4 4 0 0 0 4-4v-6M5.5 13h-2M18.5 13h2"/>'),
    bottle: icon('<path d="M9.5 3h5M10.2 3v2.6L8 8.4v10.1A2.5 2.5 0 0 0 10.5 21h3a2.5 2.5 0 0 0 2.5-2.5V8.4l-2.2-2.8V3"/><path d="M8 12h3M8 15.5h3"/>'),
    diaper: icon('<path d="M3.5 7h17v3.2a8.5 8.5 0 0 1-17 0z"/><path d="M7.5 7v2.5M16.5 7v2.5M9 15.5c1.8 1.2 4.2 1.2 6 0"/>'),
    thermo: icon('<path d="M10 4.8a2 2 0 0 1 4 0v8.6a4 4 0 1 1-4 0z"/><path d="M12 10v6.2"/>'),
    syringe: icon('<path d="M17.5 3.5l3 3M19 5l-3 3M15.5 6l2.5 2.5M16.8 7.3l-8.6 8.6-3.1.5.5-3.1 8.6-8.6M5.2 18.8L3.5 20.5M9.4 10.6l1.6 1.6M7.6 12.4l1.6 1.6"/>'),
    spoon: icon('<path d="M12 3.5c-2.1 0-3.4 1.9-3.4 4.1 0 1.9 1.2 3.3 2.5 3.7V20a.9.9 0 0 0 1.8 0v-8.7c1.3-.4 2.5-1.8 2.5-3.7 0-2.2-1.3-4.1-3.4-4.1z"/>'),
    flag: icon('<path d="M6 21V4M6 4.5h10.5l-2.2 3.7 2.2 3.8H6"/>'),
    alert: icon('<path d="M12 4.2l9 15.6H3z"/><path d="M12 10v4.4M12 17.2h0"/>'),
    home: icon('<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.6v9.9h12V9.6"/><path d="M12 17.2l-2-1.9a1.25 1.25 0 0 1 2-1.5 1.25 1.25 0 0 1 2 1.5z"/>'),
    notes: icon('<rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M8.8 8.5h6.4M8.8 12h6.4M8.8 15.5h3.6"/>'),
    grid: icon('<rect x="4" y="4" width="6.6" height="6.6" rx="2"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="2"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="2"/><circle cx="16.7" cy="16.7" r="3.3"/>'),
    chevronLeft: icon('<path d="M14.5 5.5L8 12l6.5 6.5"/>', 2.2),
    chevronRight: icon('<path d="M9.5 5.5L16 12l-6.5 6.5"/>', 2.2),
    heart: icon('<path d="M12 19.5l-6.6-6.3a4.1 4.1 0 0 1 6.6-4.8 4.1 4.1 0 0 1 6.6 4.8z"/>'),
    heartPulse: icon('<path d="M12 19.5l-6.6-6.3a4.1 4.1 0 0 1 6.6-4.8 4.1 4.1 0 0 1 6.6 4.8z"/><path d="M3.5 12.5h4l1.5-2.5 2.5 5 1.5-2.5h7.5"/>'),
    drop: icon('<path d="M12 3.8c3.4 4.3 5.8 7.6 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-3 2.4-6.3 5.8-10.6z"/><path d="M9.4 14.6a2.7 2.7 0 0 0 2.4 2.6"/>'),
    scan: icon('<path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><path d="M14.6 9.6a3.6 3.6 0 1 0-1 4.4c.6 1 1.6 1.6 2.6 1.4"/>'),
    book: icon('<path d="M12 6.5C10 5 7.5 4.5 4 4.8v13.4c3.5-.3 6 .2 8 1.8 2-1.6 4.5-2.1 8-1.8V4.8c-3.5-.3-6 .2-8 1.7z"/><path d="M12 6.5V20"/>'),
    moon: icon('<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.9 7.9 0 1 0 10.1 10.1z"/><path d="M16.5 3.5v3.4M14.8 5.2h3.4"/>'),
    play: icon('<path d="M8 5.6v12.8l10.2-6.4z"/>', 2),
    pause: icon('<path d="M8.5 5.5v13M15.5 5.5v13"/>', 2.6),
    stop: icon('<rect x="6.5" y="6.5" width="11" height="11" rx="2.2"/>', 2),
    shuffle: icon('<path d="M4 7h3.2c4.3 0 5.3 10 9.6 10H20M4 17h3.2c1.6 0 2.7-1.4 3.6-3.3M13.2 10.3C14.1 8.4 15.2 7 16.8 7H20M17.6 4.6L20 7l-2.4 2.4M17.6 14.6L20 17l-2.4 2.4"/>'),
    textSize: icon('<path d="M3.5 18.5L8.5 6l5 12.5M5.3 14.2h6.4M14.8 18.5l3-7.2 3 7.2M15.8 16.2h4"/>'),
    smile: icon('<circle cx="12" cy="12" r="8.5"/><path d="M8.6 13.8a4.2 4.2 0 0 0 6.8 0"/><path d="M9.3 9.6h.01M14.7 9.6h.01" stroke-width="2.6"/>'),
    pencil: icon('<path d="M5 19l1-4.2L15.6 5.2a1.9 1.9 0 0 1 2.7 0l.5.5a1.9 1.9 0 0 1 0 2.7L9.2 18z"/><path d="M13.8 7l3.2 3.2"/>'),
  };

  Baby.art = {
    honeyPot: svg('0 0 64 64', HONEY_POT),
    bee: svg('0 0 40 30', BEE),
    beeWorried: svg('0 0 40 30', BEE + SWEAT(34.2, 10.4)),
    balloon: svg('0 0 30 52', BALLOON_BODY + BALLOON_STRING),
    honeycomb: svg('0 0 130 100', HONEYCOMB),
    scene: svg('0 0 360 210', SCENE),
    mood: Object.fromEntries(Object.entries(MOOD_FACES).map(([id, inner]) => [id, svg('0 0 32 32', inner)])),
    burst: {
      ...Object.fromEntries(Object.entries(BURST_BITS).map(([id, inner]) => [id, svg('0 0 16 16', inner)])),
      comb: svg('0 0 16 16', `<path d="${hexPath(8, 8, 6.4)}" fill="#F6D58E" stroke="#E2B867" stroke-width="1.2"/>`),
    },
    icon: icons,
  };
})();
