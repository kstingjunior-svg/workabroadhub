const i={KE:"254",ZA:"27"};function o(s,t="KE"){const n=i[t],c=t==="ZA"?11:12;let e=s.replace(/[^\d]/g,"");return e.startsWith("0")&&(e=n+e.slice(1)),e.slice(0,c)}export{o as f};
