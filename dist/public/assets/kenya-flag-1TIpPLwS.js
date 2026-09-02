import{j as e}from"./react-vendor-r13h66Nr.js";const n={xs:18,sm:28,md:40,lg:64,xl:96};function o({width:t,size:s="md",animated:l=!0,className:r=""}){const a=t??n[s],i=Math.round(a*(2/3));return e.jsxs("span",{role:"img","aria-label":"Kenya flag",className:`relative inline-block kenya-flag-host ${r}`,style:{width:`${a}px`,height:`${i}px`},"data-animated":l?"true":"false",children:[e.jsx("style",{children:`
        @keyframes kenyaFlagWave {
          0%   { transform: perspective(80px) rotateY(0deg)  skewY(0deg);    }
          25%  { transform: perspective(80px) rotateY(7deg)  skewY(-0.6deg); }
          50%  { transform: perspective(80px) rotateY(0deg)  skewY(0deg);    }
          75%  { transform: perspective(80px) rotateY(-5deg) skewY(0.6deg);  }
          100% { transform: perspective(80px) rotateY(0deg)  skewY(0deg);    }
        }
        .kenya-flag-host svg { transform-origin: left center; }
        .kenya-flag-host[data-animated="true"] svg {
          animation: kenyaFlagWave 3.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .kenya-flag-host[data-animated="true"] svg { animation: none; }
        }
      `}),e.jsxs("svg",{viewBox:"0 0 60 40",xmlns:"http://www.w3.org/2000/svg",className:"absolute inset-0 w-full h-full",style:{filter:"drop-shadow(0 1px 2px rgb(0 0 0 / 0.3))"},children:[e.jsx("rect",{x:"0",y:"0",width:"60",height:"13.3",fill:"#000000"}),e.jsx("rect",{x:"0",y:"13.3",width:"60",height:"0.7",fill:"#FFFFFF"}),e.jsx("rect",{x:"0",y:"14",width:"60",height:"12",fill:"#BB0000"}),e.jsx("rect",{x:"0",y:"26",width:"60",height:"0.7",fill:"#FFFFFF"}),e.jsx("rect",{x:"0",y:"26.7",width:"60",height:"13.3",fill:"#006600"}),e.jsxs("g",{stroke:"#FFFFFF",strokeWidth:"1.3",strokeLinecap:"round",children:[e.jsx("line",{x1:"22",y1:"11.5",x2:"38",y2:"28.5"}),e.jsx("line",{x1:"38",y1:"11.5",x2:"22",y2:"28.5"})]}),e.jsxs("g",{fill:"#FFFFFF",children:[e.jsx("polygon",{points:"22,11 19.5,10.5 21,13.5"}),e.jsx("polygon",{points:"38,11 40.5,10.5 39,13.5"}),e.jsx("polygon",{points:"22,29 19.5,29.5 21,26.5"}),e.jsx("polygon",{points:"38,29 40.5,29.5 39,26.5"})]}),e.jsxs("g",{transform:"translate(30, 20)",children:[e.jsx("ellipse",{rx:"6.2",ry:"8.5",fill:"#FFFFFF"}),e.jsx("ellipse",{rx:"4.8",ry:"7.2",fill:"#BB0000"}),e.jsx("ellipse",{rx:"3.2",ry:"5",fill:"#000000"}),e.jsx("ellipse",{rx:"1.8",ry:"3",fill:"#BB0000"})]})]})]})}function d({height:t=3,withFimbriations:s=!1,className:l=""}){return e.jsxs("div",{className:`flex w-full ${l}`,style:{height:`${t}px`},"aria-hidden":"true",children:[e.jsx("div",{className:"flex-1",style:{background:"#000000"}}),s&&e.jsx("div",{style:{width:1,background:"#FFFFFF"}}),e.jsx("div",{className:"flex-1",style:{background:"#BB0000"}}),s&&e.jsx("div",{style:{width:1,background:"#FFFFFF"}}),e.jsx("div",{className:"flex-1",style:{background:"#006600"}})]})}export{o as K,d as a};
