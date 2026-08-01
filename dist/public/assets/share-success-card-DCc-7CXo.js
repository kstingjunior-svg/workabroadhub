import{j as l}from"./react-vendor-r13h66Nr.js";function c(t){const e=m(t.firstName)||"I",n=t.serviceName||"CV",i=(t.targetCountry||"").trim(),r=typeof t.atsScore=="number"&&t.atsScore>0?t.atsScore:null,s={cv:"#14b8a6",linkedin:"#0a66c2",cover:"#f59e0b",sop:"#8b5cf6","job-match":"#22c55e",generic:"#14b8a6"}[t.variant||"cv"],o=y(t.variant||"cv",i),f=r?`
      <g transform="translate(540, 460)">
        <circle cx="0" cy="0" r="140" fill="${s}" fill-opacity="0.15" stroke="${s}" stroke-width="6"/>
        <text x="0" y="10" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="88" font-weight="800" fill="#ffffff">${r}%</text>
        <text x="0" y="60" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="${s}">ATS SCORE</text>
      </g>
    `:"";return`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${s}"/>
      <stop offset="100%" stop-color="${p(s)}"/>
    </linearGradient>
  </defs>

  <rect width="1080" height="1080" fill="url(#bg)"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="1080" height="12" fill="url(#accentBar)"/>

  <!-- Corner decoration -->
  <circle cx="1000" cy="80" r="60" fill="${s}" fill-opacity="0.1"/>
  <circle cx="1000" cy="80" r="30" fill="${s}" fill-opacity="0.2"/>

  <!-- Kicker -->
  <text x="80" y="160" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="600" fill="${s}" letter-spacing="2">
    ${n.toUpperCase()}
  </text>

  <!-- Headline (2 lines max) -->
  ${d(o,e)}

  ${f}

  <!-- Country pill if present -->
  ${i?`
    <g transform="translate(540, 700)">
      <rect x="-180" y="-40" width="360" height="80" rx="40" fill="#ffffff" fill-opacity="0.1" stroke="${s}" stroke-width="3"/>
      <text x="0" y="15" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="700" fill="#ffffff">
        for ${i}
      </text>
    </g>
  `:""}

  <!-- CTA / URL block -->
  <g transform="translate(0, 880)">
    <rect x="80" y="0" width="920" height="120" rx="24" fill="${s}"/>
    <text x="540" y="55" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="800" fill="#ffffff">
      Get YOURS for KES 99
    </text>
    <text x="540" y="95" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="500" fill="#ffffff" fill-opacity="0.9">
      workabroadhub.tech
    </text>
  </g>

  <!-- Bottom brand -->
  <text x="540" y="1035" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="600" fill="#64748b" letter-spacing="3">
    WORKABROADHUB · KENYA'S OVERSEAS JOBS PLATFORM
  </text>
</svg>`.trim()}function h(t){const e=c(t);return l.jsx("div",{className:t.className,style:{width:"100%",aspectRatio:"1 / 1",...t.style},dangerouslySetInnerHTML:{__html:e},"data-testid":"share-success-card"})}function m(t){if(!t)return"";const e=t.trim();return e?e.includes("@")?e.split("@")[0].split(".")[0]||"":e.split(/\s+/)[0]:""}function y(t,e){switch(t){case"linkedin":return"just optimized my LinkedIn for overseas recruiters.";case"cover":return e?`just got a killer cover letter for ${e}.`:"just got a killer cover letter written.";case"sop":return"just got my Statement of Purpose written.";case"job-match":return"just found real overseas job matches.";default:return e?`just optimized my CV for jobs in ${e}.`:"just got my CV optimized for overseas jobs."}}function d(t,e){const i=`${e} ${t}`.split(" "),r=Math.ceil(i.length/2),s=i.slice(0,r).join(" "),o=i.slice(r).join(" ");return`
    <text x="80" y="300" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="800" fill="#ffffff">
      ${a(s)}
    </text>
    <text x="80" y="370" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="800" fill="#ffffff">
      ${a(o)}
    </text>
  `}function a(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}function p(t){const e=t.replace("#",""),n=Math.min(255,parseInt(e.slice(0,2),16)+40),i=Math.min(255,parseInt(e.slice(2,4),16)+40),r=Math.min(255,parseInt(e.slice(4,6),16)+40);return`#${[n,i,r].map(s=>s.toString(16).padStart(2,"0")).join("")}`}export{h as S,c as b};
