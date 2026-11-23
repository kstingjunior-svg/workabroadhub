/**
 * Kenyan towns, estates and neighbourhoods with approximate coordinates
 * (2026-11, local jobs "near me"). Used to place a job on the map from its
 * estate/town/county, and to turn a typed location ("Kahawa Wendani") into
 * coordinates when the visitor doesn't share GPS.
 *
 * Coordinates are approximate centres (±1–2 km) — good enough for
 * "jobs within 15–30 km". Add places freely; keep names as people say them.
 */
export interface KenyaPlace { name: string; county: string; lat: number; lng: number; aliases?: string[] }

export const KENYA_PLACES: KenyaPlace[] = [
  // ── Nairobi ──
  { name: "Nairobi CBD", county: "Nairobi", lat: -1.2864, lng: 36.8172, aliases: ["town", "cbd", "nairobi"] },
  { name: "Westlands", county: "Nairobi", lat: -1.2676, lng: 36.8108 },
  { name: "Parklands", county: "Nairobi", lat: -1.2620, lng: 36.8180 },
  { name: "Kilimani", county: "Nairobi", lat: -1.2910, lng: 36.7860 },
  { name: "Kileleshwa", county: "Nairobi", lat: -1.2790, lng: 36.7830 },
  { name: "Lavington", county: "Nairobi", lat: -1.2800, lng: 36.7690 },
  { name: "Hurlingham", county: "Nairobi", lat: -1.2960, lng: 36.7980 },
  { name: "Upper Hill", county: "Nairobi", lat: -1.2990, lng: 36.8150 },
  { name: "Karen", county: "Nairobi", lat: -1.3190, lng: 36.7070 },
  { name: "Langata", county: "Nairobi", lat: -1.3500, lng: 36.7550, aliases: ["lang'ata"] },
  { name: "South B", county: "Nairobi", lat: -1.3110, lng: 36.8400 },
  { name: "South C", county: "Nairobi", lat: -1.3200, lng: 36.8270 },
  { name: "Industrial Area", county: "Nairobi", lat: -1.3080, lng: 36.8520 },
  { name: "Embakasi", county: "Nairobi", lat: -1.3200, lng: 36.9000 },
  { name: "Utawala", county: "Nairobi", lat: -1.2870, lng: 36.9600 },
  { name: "Donholm", county: "Nairobi", lat: -1.2960, lng: 36.8880 },
  { name: "Umoja", county: "Nairobi", lat: -1.2830, lng: 36.8990 },
  { name: "Kayole", county: "Nairobi", lat: -1.2760, lng: 36.9160 },
  { name: "Buruburu", county: "Nairobi", lat: -1.2870, lng: 36.8770 },
  { name: "Eastleigh", county: "Nairobi", lat: -1.2730, lng: 36.8490 },
  { name: "Kariobangi", county: "Nairobi", lat: -1.2570, lng: 36.8800 },
  { name: "Dandora", county: "Nairobi", lat: -1.2500, lng: 36.8990 },
  { name: "Kasarani", county: "Nairobi", lat: -1.2210, lng: 36.8980 },
  { name: "Roysambu", county: "Nairobi", lat: -1.2180, lng: 36.8870 },
  { name: "Zimmerman", county: "Nairobi", lat: -1.2120, lng: 36.8930 },
  { name: "Githurai", county: "Nairobi", lat: -1.2010, lng: 36.9130, aliases: ["githurai 44", "githurai 45"] },
  { name: "Kahawa West", county: "Nairobi", lat: -1.1870, lng: 36.9000 },
  { name: "Kahawa Wendani", county: "Kiambu", lat: -1.1800, lng: 36.9330, aliases: ["kahawa", "wendani"] },
  { name: "Kahawa Sukari", county: "Kiambu", lat: -1.1890, lng: 36.9440, aliases: ["sukari"] },
  { name: "Mwiki", county: "Nairobi", lat: -1.2100, lng: 36.9370 },
  { name: "Ruaraka", county: "Nairobi", lat: -1.2440, lng: 36.8720 },
  { name: "Thome", county: "Nairobi", lat: -1.2160, lng: 36.8660 },
  { name: "Gigiri", county: "Nairobi", lat: -1.2340, lng: 36.8030 },
  { name: "Runda", county: "Nairobi", lat: -1.2180, lng: 36.8100 },
  { name: "Muthaiga", county: "Nairobi", lat: -1.2480, lng: 36.8350 },
  { name: "Kangemi", county: "Nairobi", lat: -1.2650, lng: 36.7480 },
  { name: "Kawangware", county: "Nairobi", lat: -1.2840, lng: 36.7460 },
  { name: "Dagoretti", county: "Nairobi", lat: -1.2990, lng: 36.7280 },
  { name: "Kibera", county: "Nairobi", lat: -1.3130, lng: 36.7870 },
  { name: "Ngong Road", county: "Nairobi", lat: -1.3000, lng: 36.7800 },
  { name: "Madaraka", county: "Nairobi", lat: -1.3080, lng: 36.8190 },
  { name: "Pangani", county: "Nairobi", lat: -1.2680, lng: 36.8380 },
  { name: "Ngara", county: "Nairobi", lat: -1.2740, lng: 36.8230 },
  { name: "Mathare", county: "Nairobi", lat: -1.2600, lng: 36.8600 },
  { name: "Kitengela", county: "Kajiado", lat: -1.4730, lng: 36.9580 },
  { name: "Syokimau", county: "Machakos", lat: -1.3630, lng: 36.9390 },
  { name: "Mlolongo", county: "Machakos", lat: -1.3870, lng: 36.9410 },
  { name: "Athi River", county: "Machakos", lat: -1.4560, lng: 36.9780, aliases: ["mavoko"] },
  { name: "Rongai", county: "Kajiado", lat: -1.3960, lng: 36.7550, aliases: ["ongata rongai"] },
  { name: "Ngong", county: "Kajiado", lat: -1.3620, lng: 36.6550 },
  { name: "Kiserian", county: "Kajiado", lat: -1.4250, lng: 36.6900 },
  { name: "Kajiado Town", county: "Kajiado", lat: -1.8520, lng: 36.7760, aliases: ["kajiado"] },
  { name: "Isinya", county: "Kajiado", lat: -1.6720, lng: 36.8370 },
  // ── Kiambu ──
  { name: "Ruiru", county: "Kiambu", lat: -1.1460, lng: 36.9600 },
  { name: "Juja", county: "Kiambu", lat: -1.1020, lng: 37.0140 },
  { name: "Thika", county: "Kiambu", lat: -1.0330, lng: 37.0690 },
  { name: "Kiambu Town", county: "Kiambu", lat: -1.1710, lng: 36.8350, aliases: ["kiambu"] },
  { name: "Kikuyu", county: "Kiambu", lat: -1.2460, lng: 36.6630 },
  { name: "Limuru", county: "Kiambu", lat: -1.1100, lng: 36.6420 },
  { name: "Banana", county: "Kiambu", lat: -1.1800, lng: 36.7930, aliases: ["banana hill"] },
  { name: "Githunguri", county: "Kiambu", lat: -1.0570, lng: 36.7750 },
  { name: "Gatundu", county: "Kiambu", lat: -1.0090, lng: 36.9050 },
  { name: "Kimbo", county: "Kiambu", lat: -1.1320, lng: 36.9480 },
  { name: "Membley", county: "Kiambu", lat: -1.1570, lng: 36.9330 },
  { name: "Tatu City", county: "Kiambu", lat: -1.1600, lng: 36.9000 },
  { name: "Ruaka", county: "Kiambu", lat: -1.2060, lng: 36.7800 },
  { name: "Wangige", county: "Kiambu", lat: -1.2240, lng: 36.7140 },
  { name: "Karuri", county: "Kiambu", lat: -1.1720, lng: 36.7710 },
  // ── Central ──
  { name: "Murang'a", county: "Murang'a", lat: -0.7210, lng: 37.1520, aliases: ["muranga"] },
  { name: "Kenol", county: "Murang'a", lat: -0.9070, lng: 37.1310 },
  { name: "Nyeri", county: "Nyeri", lat: -0.4200, lng: 36.9470 },
  { name: "Karatina", county: "Nyeri", lat: -0.4830, lng: 37.1270 },
  { name: "Othaya", county: "Nyeri", lat: -0.5490, lng: 36.9440 },
  { name: "Kerugoya", county: "Kirinyaga", lat: -0.4990, lng: 37.2800 },
  { name: "Kutus", county: "Kirinyaga", lat: -0.5650, lng: 37.3230 },
  { name: "Sagana", county: "Kirinyaga", lat: -0.6670, lng: 37.2080 },
  { name: "Nyahururu", county: "Laikipia", lat: 0.0400, lng: 36.3630 },
  { name: "Nanyuki", county: "Laikipia", lat: 0.0090, lng: 37.0730 },
  { name: "Ol Kalou", county: "Nyandarua", lat: -0.2700, lng: 36.3800 },
  // ── Eastern ──
  { name: "Machakos", county: "Machakos", lat: -1.5180, lng: 37.2630 },
  { name: "Kangundo", county: "Machakos", lat: -1.3020, lng: 37.3480 },
  { name: "Tala", county: "Machakos", lat: -1.2670, lng: 37.3200 },
  { name: "Wote", county: "Makueni", lat: -1.7830, lng: 37.6290, aliases: ["makueni"] },
  { name: "Emali", county: "Makueni", lat: -2.0790, lng: 37.4730 },
  { name: "Kitui", county: "Kitui", lat: -1.3670, lng: 38.0110 },
  { name: "Mwingi", county: "Kitui", lat: -0.9340, lng: 38.0600 },
  { name: "Embu", county: "Embu", lat: -0.5310, lng: 37.4500 },
  { name: "Runyenjes", county: "Embu", lat: -0.4220, lng: 37.5730 },
  { name: "Meru", county: "Meru", lat: 0.0470, lng: 37.6490 },
  { name: "Maua", county: "Meru", lat: 0.2330, lng: 37.9400 },
  { name: "Chuka", county: "Tharaka-Nithi", lat: -0.3330, lng: 37.6460 },
  { name: "Isiolo", county: "Isiolo", lat: 0.3540, lng: 37.5820 },
  { name: "Marsabit", county: "Marsabit", lat: 2.3340, lng: 37.9900 },
  // ── Coast ──
  { name: "Mombasa CBD", county: "Mombasa", lat: -4.0435, lng: 39.6682, aliases: ["mombasa"] },
  { name: "Nyali", county: "Mombasa", lat: -4.0240, lng: 39.7120 },
  { name: "Bamburi", county: "Mombasa", lat: -3.9970, lng: 39.7250 },
  { name: "Likoni", county: "Mombasa", lat: -4.0860, lng: 39.6620 },
  { name: "Changamwe", county: "Mombasa", lat: -4.0250, lng: 39.6270 },
  { name: "Mtwapa", county: "Kilifi", lat: -3.9420, lng: 39.7450 },
  { name: "Kilifi", county: "Kilifi", lat: -3.6310, lng: 39.8490 },
  { name: "Malindi", county: "Kilifi", lat: -3.2190, lng: 40.1170 },
  { name: "Watamu", county: "Kilifi", lat: -3.3540, lng: 40.0240 },
  { name: "Ukunda", county: "Kwale", lat: -4.2870, lng: 39.5660, aliases: ["diani"] },
  { name: "Kwale", county: "Kwale", lat: -4.1740, lng: 39.4520 },
  { name: "Voi", county: "Taita-Taveta", lat: -3.3960, lng: 38.5560 },
  { name: "Lamu", county: "Lamu", lat: -2.2690, lng: 40.9020 },
  { name: "Hola", county: "Tana River", lat: -1.4990, lng: 40.0300 },
  { name: "Garissa", county: "Garissa", lat: -0.4570, lng: 39.6580 },
  // ── Rift Valley ──
  { name: "Nakuru", county: "Nakuru", lat: -0.3031, lng: 36.0800 },
  { name: "Naivasha", county: "Nakuru", lat: -0.7170, lng: 36.4310 },
  { name: "Gilgil", county: "Nakuru", lat: -0.4990, lng: 36.3220 },
  { name: "Molo", county: "Nakuru", lat: -0.2490, lng: 35.7320 },
  { name: "Njoro", county: "Nakuru", lat: -0.3300, lng: 35.9440 },
  { name: "Eldoret", county: "Uasin Gishu", lat: 0.5143, lng: 35.2698 },
  { name: "Burnt Forest", county: "Uasin Gishu", lat: 0.2280, lng: 35.4400 },
  { name: "Iten", county: "Elgeyo-Marakwet", lat: 0.6700, lng: 35.5080 },
  { name: "Kapsabet", county: "Nandi", lat: 0.2030, lng: 35.1050 },
  { name: "Kericho", county: "Kericho", lat: -0.3690, lng: 35.2860 },
  { name: "Litein", county: "Kericho", lat: -0.5830, lng: 35.1890 },
  { name: "Bomet", county: "Bomet", lat: -0.7820, lng: 35.3420 },
  { name: "Narok", county: "Narok", lat: -1.0780, lng: 35.8600 },
  { name: "Kitale", county: "Trans Nzoia", lat: 1.0150, lng: 35.0060 },
  { name: "Kapenguria", county: "West Pokot", lat: 1.2390, lng: 35.1120 },
  { name: "Lodwar", county: "Turkana", lat: 3.1190, lng: 35.5970 },
  { name: "Kabarnet", county: "Baringo", lat: 0.4920, lng: 35.7430 },
  { name: "Eldama Ravine", county: "Baringo", lat: 0.0510, lng: 35.7240 },
  { name: "Maralal", county: "Samburu", lat: 1.0960, lng: 36.6980 },
  // ── Western ──
  { name: "Kakamega", county: "Kakamega", lat: 0.2827, lng: 34.7519 },
  { name: "Mumias", county: "Kakamega", lat: 0.3360, lng: 34.4880 },
  { name: "Malava", county: "Kakamega", lat: 0.4460, lng: 34.8540 },
  { name: "Lurambi", county: "Kakamega", lat: 0.2940, lng: 34.7650 },
  { name: "Mbale", county: "Vihiga", lat: 0.0830, lng: 34.7230, aliases: ["vihiga"] },
  { name: "Luanda", county: "Vihiga", lat: 0.0320, lng: 34.6130 },
  { name: "Bungoma", county: "Bungoma", lat: 0.5630, lng: 34.5600 },
  { name: "Webuye", county: "Bungoma", lat: 0.6070, lng: 34.7710 },
  { name: "Kimilili", county: "Bungoma", lat: 0.7870, lng: 34.7180 },
  { name: "Busia", county: "Busia", lat: 0.4600, lng: 34.1110 },
  { name: "Malaba", county: "Busia", lat: 0.6360, lng: 34.2770 },
  // ── Nyanza ──
  { name: "Kisumu", county: "Kisumu", lat: -0.0917, lng: 34.7680 },
  { name: "Ahero", county: "Kisumu", lat: -0.1740, lng: 34.9190 },
  { name: "Maseno", county: "Kisumu", lat: -0.0050, lng: 34.6050 },
  { name: "Siaya", county: "Siaya", lat: 0.0610, lng: 34.2880 },
  { name: "Bondo", county: "Siaya", lat: -0.0960, lng: 34.2730 },
  { name: "Homa Bay", county: "Homa Bay", lat: -0.5270, lng: 34.4570 },
  { name: "Mbita", county: "Homa Bay", lat: -0.4290, lng: 34.2070 },
  { name: "Migori", county: "Migori", lat: -1.0630, lng: 34.4730 },
  { name: "Awendo", county: "Migori", lat: -0.9010, lng: 34.5360 },
  { name: "Kisii", county: "Kisii", lat: -0.6810, lng: 34.7660 },
  { name: "Ogembo", county: "Kisii", lat: -0.8000, lng: 34.7250 },
  { name: "Nyamira", county: "Nyamira", lat: -0.5630, lng: 34.9350 },
  { name: "Keroka", county: "Nyamira", lat: -0.7750, lng: 34.9460 },
  // ── North Eastern ──
  { name: "Wajir", county: "Wajir", lat: 1.7470, lng: 40.0570 },
  { name: "Mandera", county: "Mandera", lat: 3.9370, lng: 41.8550 },
];

/** Approximate county centres (fallback when only the county is known). */
export const COUNTY_CENTRES: Record<string, [number, number]> = {
  "Nairobi": [-1.2864, 36.8172], "Kiambu": [-1.1714, 36.8356], "Kajiado": [-1.8520, 36.7760], "Machakos": [-1.5180, 37.2630],
  "Murang'a": [-0.7210, 37.1520], "Nyeri": [-0.4200, 36.9470], "Kirinyaga": [-0.4990, 37.2800], "Nyandarua": [-0.2700, 36.3800],
  "Laikipia": [0.0090, 37.0730], "Makueni": [-1.7830, 37.6290], "Kitui": [-1.3670, 38.0110], "Embu": [-0.5310, 37.4500],
  "Meru": [0.0470, 37.6490], "Tharaka-Nithi": [-0.3330, 37.6460], "Isiolo": [0.3540, 37.5820], "Marsabit": [2.3340, 37.9900],
  "Mombasa": [-4.0435, 39.6682], "Kilifi": [-3.6310, 39.8490], "Kwale": [-4.1740, 39.4520], "Taita-Taveta": [-3.3960, 38.5560],
  "Lamu": [-2.2690, 40.9020], "Tana River": [-1.4990, 40.0300], "Garissa": [-0.4570, 39.6580], "Wajir": [1.7470, 40.0570],
  "Mandera": [3.9370, 41.8550], "Nakuru": [-0.3031, 36.0800], "Uasin Gishu": [0.5143, 35.2698], "Elgeyo-Marakwet": [0.6700, 35.5080],
  "Nandi": [0.2030, 35.1050], "Kericho": [-0.3690, 35.2860], "Bomet": [-0.7820, 35.3420], "Narok": [-1.0780, 35.8600],
  "Trans Nzoia": [1.0150, 35.0060], "West Pokot": [1.2390, 35.1120], "Turkana": [3.1190, 35.5970], "Baringo": [0.4920, 35.7430],
  "Samburu": [1.0960, 36.6980], "Kakamega": [0.2827, 34.7519], "Vihiga": [0.0830, 34.7230], "Bungoma": [0.5630, 34.5600],
  "Busia": [0.4600, 34.1110], "Kisumu": [-0.0917, 34.7680], "Siaya": [0.0610, 34.2880], "Homa Bay": [-0.5270, 34.4570],
  "Migori": [-1.0630, 34.4730], "Kisii": [-0.6810, 34.7660], "Nyamira": [-0.5630, 34.9350],
};

const norm = (s: string) => s.toLowerCase().replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Best place match for free text ("kahawa wendani", "Ruiru town", "Kakamega"). */
export function findPlace(text: string | null | undefined): KenyaPlace | null {
  const q = norm(String(text ?? "")).replace(/\b(town|estate|area|county|ward)\b/g, "").trim();
  if (!q) return null;
  let best: KenyaPlace | null = null;
  for (const p of KENYA_PLACES) {
    const names = [p.name, ...(p.aliases ?? [])].map(norm);
    if (names.includes(q)) return p;
    if (!best && names.some((n) => n.length >= 4 && (q.includes(n) || n.includes(q)))) best = p;
  }
  if (best) return best;
  const county = Object.keys(COUNTY_CENTRES).find((c) => norm(c) === q);
  if (county) { const [lat, lng] = COUNTY_CENTRES[county]; return { name: county, county, lat, lng }; }
  return null;
}

/** Coordinates for a job from its estate → town → county (most specific wins). */
export function locateJob(estate?: string | null, town?: string | null, county?: string | null): { lat: number; lng: number } | null {
  for (const t of [estate, town]) { const p = findPlace(t); if (p) return { lat: p.lat, lng: p.lng }; }
  if (county && COUNTY_CENTRES[county]) { const [lat, lng] = COUNTY_CENTRES[county]; return { lat, lng }; }
  const p = findPlace(county); return p ? { lat: p.lat, lng: p.lng } : null;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
