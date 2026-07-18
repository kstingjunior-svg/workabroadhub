"use strict";
/**
 * human-voice.ts
 *
 * 2026-07: users were telling Tony our AI-generated CVs and cover letters
 * sound too generic — "hundreds of Canadian farms get these, mine has to
 * stand out". This module is the shared voice/style engine used by every
 * document generator (write-from-scratch, cv.ts, application-materials.ts,
 * jobApplicationGenerator.ts).
 *
 * It does three things:
 *   1. HUMAN_VOICE_RULES — the anti-generic guardrails GPT keeps forgetting
 *      unless we shout them. No em-dashes, no "delve into", no "In today's
 *      world", no "leverage/utilize/spearhead". First-person specifics.
 *      Achievement-first bullets ("verb + number + object + timeframe").
 *   2. roleVerticalContext(role) — returns a targeted block of terminology,
 *      typical achievements, and tone for that specific career vertical.
 *      A farm worker, chef, driver, pilot, nurse, welder, care assistant
 *      each get a different voice.
 *   3. stripAiTells(text) — post-processor. Even with rules, GPT slips in
 *      em-dashes and "furthermore". We clean up before shipping the file.
 *
 * All four generators call these; users don't get a different CV depending
 * on which entry point they used.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HUMAN_VOICE_RULES = void 0;
exports.roleVerticalContext = roleVerticalContext;
exports.stripAiTells = stripAiTells;
// ─── Rule block that goes in every system prompt ─────────────────────────
exports.HUMAN_VOICE_RULES = `
VOICE. This is the difference between a document that gets ignored and one
that gets a call back. Follow every rule:

1. WRITE LIKE A HUMAN, NOT LIKE CHATGPT. Zero em-dashes at all. Use commas or
   periods. Zero of these phrases anywhere: "delve into", "in today's
   fast-paced world", "in the ever-evolving landscape", "leverage",
   "utilize" (use "use"), "spearhead", "orchestrate", "seamlessly",
   "furthermore", "moreover", "in conclusion", "it is worth noting",
   "landscape of", "navigate the complexities", "cutting-edge",
   "results-driven", "detail-oriented", "team player", "hardworking",
   "self-motivated", "go-getter", "passionate about excellence",
   "synergy", "value-add".

2. ACHIEVEMENT SHAPE. Every experience bullet uses this shape:
       {strong verb} + {number or specific} + {what} + {timeframe/scale}
   Bad:  "Responsible for harvesting crops on a large farm."
   Good: "Harvested 4.2 tonnes of tomatoes per week across the 2024 summer
          season on a 60-acre farm in Naivasha."
   If the user did not give a number, ask for one via a labelled placeholder
   like "[how many acres / patients / trips / meals]" instead of inventing
   or writing a vague sentence.

3. WARMTH + SPECIFICITY. Anchor claims in the real world. Mention the
   season, the crop, the ward, the route, the equipment model, the shift
   pattern, the language spoken with the patient. Sensory detail signals
   this person was actually there.

4. FIRST-PERSON HONESTY (cover letters + summaries). Say what the candidate
   actually cares about and why. "I want to work on a Canadian dairy farm
   because I grew up around cattle in Bomet and I understand what it takes
   to keep 80 heifers healthy through a cold winter." That is warm and
   specific. "I am a hardworking individual passionate about agriculture"
   is dead on arrival.

5. RESPECT THE READER. The hiring manager reads 200 of these a day. Do NOT
   open a cover letter with "I am writing to express my interest in the
   position of…". Open with something they will remember: a concrete detail
   from the candidate's life that maps to the job.

6. NO FILLER. If a paragraph could apply to any candidate for any job in
   any country, delete it and start over.
`.trim();
const ROLE_VERTICALS = [
    {
        keywords: /\b(farm|agricultur|crop|dairy|orchard|greenhouse|harvest|livestock|cattle|poultry|pig|goat|sheep)\b/i,
        label: "Agricultural / Farm Worker",
        voice: `
Vertical: Agricultural / Farm Worker.
Voice cues:
- Talk about seasons, crops, herd size, acreage, equipment (tractor make,
  irrigation type, milking parlour size).
- Achievements are usually "yield per acre/head", "days without livestock
  loss", "reduction in feed cost", "acres cleared per shift".
- Canadian, UK and Australian farms value: physical fitness, willingness to
  work outdoors in any weather, understanding of animal welfare, mechanical
  competence, ability to work long harvest hours.
- Warmth line: mention where the candidate grew up around this work (which
  farm, which crop, what their family did). Rural authenticity is a huge
  differentiator for people flying in from Nairobi.
`.trim(),
    },
    {
        keywords: /\b(care\s*(giver|worker|assistant)|caregiv|carer|nursing\s*assistant|healthcare\s*assist|senior\s*care|elderly|dementia)\b/i,
        label: "Care Assistant / Caregiver",
        voice: `
Vertical: Care Assistant / Caregiver / Support Worker.
Voice cues:
- Talk about the specific conditions cared for (dementia, stroke recovery,
  post-surgical, learning disabilities), age range of clients, number of
  clients per shift, whether the setting was residential / domiciliary /
  day-centre.
- Achievements are usually "supported X clients through Y condition",
  "reduced falls by Z", "completed medication rounds for N residents",
  "trained in moving-and-handling / first aid / dementia awareness".
- UK, Canada, Ireland care employers value: patience, empathy, safeguarding
  awareness, moving-and-handling, medication competency, keeping accurate
  care notes, willingness to do nights and weekends.
- Warmth line: mention who first showed the candidate this work: a
  grandparent they cared for, a hospital placement, the "why".
`.trim(),
    },
    {
        keywords: /\b(nurse|nursing|registered\s*nurse|rn\b|midwif|icu|ward|hospital|clinical)\b/i,
        label: "Nurse / Clinical",
        voice: `
Vertical: Registered Nurse / Clinical.
Voice cues:
- Talk about ward specialty (ICU, medical-surgical, paediatric, maternity),
  bed count, staff-to-patient ratio, shift pattern.
- Achievements are usually "managed X-bed unit", "reduced infection rate by
  Y", "trained N new hires", "led shift for a team of Z".
- UK NHS / Gulf hospitals value: NMC / DHA / HAAD / MOH registration
  progress, IELTS / OET score, specific clinical competencies (IV therapy,
  wound care, cannulation), knowledge of NEWS-2 / early-warning scoring.
- Warmth line: what draws the candidate to this specialty specifically.
`.trim(),
    },
    {
        keywords: /\b(driver|hgv|lgv|truck|lorry|bus|coach|chauffeur|forklift|heavy\s*equipment|excavator|crane)\b/i,
        label: "Driver / Heavy Equipment",
        voice: `
Vertical: Driver / Heavy Equipment Operator.
Voice cues:
- Talk about vehicle class held (BE, C, CE, D, or Kenyan equivalents),
  years accident-free, routes driven, load types, kilometres per year,
  countries crossed for long-haul.
- Achievements are usually "X km driven without incident", "N years zero
  claims", "on-time delivery rate Y%", "trained in tachograph / defensive
  driving / dangerous goods".
- UK, Canada, Gulf employers value: clean driving record, defensive
  driving certificate, ADR / dangerous-goods, fatigue management, GPS
  route planning, willingness to be away from home for multi-day trips.
- Warmth line: describe a memorable long haul the candidate has done.
`.trim(),
    },
    {
        keywords: /\b(chef|cook|kitchen|culinary|baker|patisserie|sous)\b/i,
        label: "Chef / Kitchen",
        voice: `
Vertical: Chef / Cook / Kitchen Professional.
Voice cues:
- Talk about cuisines specialised in, kitchen size, covers per service,
  brigade role (commis, chef de partie, sous, head), signature dishes.
- Achievements are usually "ran X-cover service", "reduced food cost by
  Y%", "cut ticket time to Z minutes", "trained N junior cooks".
- Gulf hotels, UK gastropubs, cruise lines value: HACCP, halal certification
  knowledge (Gulf), allergen management (UK), fine-dining pace, ability to
  cost menus.
- Warmth line: one dish or one service the candidate is proud of.
`.trim(),
    },
    {
        keywords: /\b(welder|welding|fitter|fabric|machinist|mechanic|electrician|plumber|carpenter|mason|construction|scaffold|hvac)\b/i,
        label: "Skilled Trade",
        voice: `
Vertical: Skilled Trade (welder, fitter, electrician, plumber, carpenter,
mechanic, mason).
Voice cues:
- Talk about specific tickets/certifications (CSCS card, ASME, 6G welding,
  City & Guilds, NEBOSH), materials worked (stainless, mild steel, PVC,
  hardwood), equipment operated (MIG, TIG, arc, Bosch tools).
- Achievements are usually "certified X procedure", "welded Y joints on Z
  project", "passed A radiographic test", "zero safety incidents on B site".
- Gulf mega-projects, Canadian trades, UK construction value: verifiable
  tickets, site-safety awareness, ability to read technical drawings,
  toolbox-talk familiarity.
- Warmth line: describe one build the candidate is proud of.
`.trim(),
    },
    {
        keywords: /\b(pilot|aviation|flight|airline|first\s*officer|captain|aircraft)\b/i,
        label: "Pilot / Aviation",
        voice: `
Vertical: Pilot / Aviation.
Voice cues:
- Total flight hours, PIC hours, aircraft types type-rated on, licence held
  (ATPL, CPL, MEIR), medical class validity, sim hours.
- Achievements are usually rated in hours and diversions handled cleanly.
- Airlines value: hours on type, English proficiency (ICAO L4/L5/L6),
  a clean checkride record, CRM training.
- Warmth line: why aviation, a first-flight memory or a mentor. Airlines
  hire captains for judgement and pilots for stories.
`.trim(),
    },
    {
        keywords: /\b(teach|teacher|tutor|instructor|lecturer|educat|school)\b/i,
        label: "Teacher / Educator",
        voice: `
Vertical: Teacher / Educator.
Voice cues:
- Talk about subject taught, age range, class size, exam results improved,
  syllabus followed (KCSE, Cambridge, IB, national curriculum).
- Achievements are usually "X% grade improvement", "N students to distinction",
  "led syllabus review", "trained M colleagues in Y".
- International schools, TEFL abroad, UK teaching value: QTS pathway,
  TEFL certification, safeguarding training, specific exam board experience.
- Warmth line: one student's transformation the candidate helped shape.
`.trim(),
    },
    {
        keywords: /\b(hotel|hospitality|waiter|waitress|barista|bartender|receptionist|concierge|housekeep)\b/i,
        label: "Hospitality / Front-of-House",
        voice: `
Vertical: Hospitality / Front-of-House.
Voice cues:
- Talk about property size (rooms / covers), guest volume, brand (Marriott,
  Hilton, independent boutique), languages spoken with guests.
- Achievements are usually "guest satisfaction score X", "upsold Y in Z
  months", "handled complaints on shift for N-star property".
- Gulf resorts, UK city-centre hotels, cruise lines value: multilingualism,
  food-hygiene certification, Opera / Micros POS familiarity, grooming and
  presentation.
- Warmth line: a memorable guest interaction the candidate is proud of.
`.trim(),
    },
    {
        keywords: /\b(security|guard|surveillance|patrol)\b/i,
        label: "Security",
        voice: `
Vertical: Security Officer / Guard.
Voice cues:
- Talk about assignment type (retail, corporate, industrial, VIP), shift
  pattern, licences held (KSIA in Kenya, SIA in UK, PSBD Gulf), incidents
  handled.
- Achievements are usually "prevented X incidents", "led response to Y",
  "years incident-free".
- UK SIA-badged roles, Gulf and Canadian security value: SIA CCTV / door
  supervisor licences, first aid, radio comms, incident report writing.
- Warmth line: an incident the candidate handled well.
`.trim(),
    },
    {
        keywords: /\b(clean|cleaner|housekeep|janitor|maid)\b/i,
        label: "Cleaner / Housekeeping",
        voice: `
Vertical: Cleaner / Housekeeping.
Voice cues:
- Talk about setting (hotel rooms per shift, hospital ward, commercial
  offices, private homes), equipment used (industrial floor scrubbers,
  chemical dilution systems), COSHH awareness.
- Achievements are usually "X rooms per shift to Y-star standard", "passed
  Z audits", "reduced chemical use by W%".
- UK, Gulf, Canadian cleaning employers value: reliability, attention to
  detail, hypoallergenic / infection-control awareness (hospital or care
  settings), ability to work unsociable hours.
- Warmth line: pride in the work, a shift where it really mattered.
`.trim(),
    },
];
/**
 * Detect the role vertical from the candidate's role/job title. If nothing
 * matches, returns a generic "role" block that still encourages specificity
 * without steering the tone.
 */
function roleVerticalContext(role) {
    const r = String(role ?? "").trim();
    if (!r)
        return GENERIC_VERTICAL;
    for (const v of ROLE_VERTICALS) {
        if (v.keywords.test(r))
            return v.voice;
    }
    return GENERIC_VERTICAL;
}
const GENERIC_VERTICAL = `
Vertical: Generic professional.
Voice cues:
- Whatever the role is, anchor every claim in a concrete workplace: how
  many people, how much money, how many customers, what equipment or tools,
  what shift, what geography.
- Achievements: {strong verb} + {number} + {what} + {timeframe}. No vague
  responsibility statements.
- Warmth line: one honest sentence about why this line of work.
`.trim();
const REPLACEMENTS = [
    // Em-dashes → commas
    [/\s*—\s*/g, ", "],
    // Word choice — verb-form aware
    [/\butilizing\b/gi, "using"],
    [/\butilized\b/gi, "used"],
    [/\butilizes\b/gi, "uses"],
    [/\butilize\b/gi, "use"],
    [/\bleveraging\b/gi, "using"],
    [/\bleveraged\b/gi, "used"],
    [/\bleverages\b/gi, "uses"],
    [/\bleverage\b/gi, "use"],
    [/\bspearheading\b/gi, "leading"],
    [/\bspearheaded\b/gi, "led"],
    [/\bspearheads\b/gi, "leads"],
    [/\bspearhead\b/gi, "lead"],
    [/\borchestrating\b/gi, "running"],
    [/\borchestrated\b/gi, "ran"],
    [/\borchestrates\b/gi, "runs"],
    [/\borchestrate\b/gi, "run"],
    [/\bseamlessly\b/gi, "smoothly"],
    [/\bfurthermore,?\s*/gi, ""],
    [/\bmoreover,?\s*/gi, ""],
    [/\bin conclusion,?\s*/gi, ""],
    [/\bit is worth noting that\b/gi, ""],
    [/\bdelve\s+into\b/gi, "get into"],
    // Marketing filler
    [/\bin today['’]s\s+(fast[-\s]paced|ever[-\s]evolving|dynamic|competitive)\s+(world|landscape|environment|market)\b/gi, ""],
    [/\b(the|a)\s+(landscape|realm|world)\s+of\b/gi, ""],
    [/\bnavigate the complexit(ies|y)\s+of\b/gi, "handle"],
    // Empty adjectives
    [/\bcutting[-\s]edge\b/gi, "modern"],
    [/\bresults[-\s]driven\b/gi, ""],
    [/\bdetail[-\s]oriented\b/gi, ""],
    [/\bteam\s+player\b/gi, ""],
    [/\bhardworking\b/gi, ""],
    [/\bself[-\s]motivated\b/gi, ""],
    [/\bpassionate about excellence\b/gi, "committed to good work"],
    [/\bsynergy\b/gi, "teamwork"],
];
/**
 * Post-process a generated document body: strip the most obvious AI tells.
 * Also cleans up doubled spaces and any orphan commas the replacements
 * leave behind.
 */
function stripAiTells(text) {
    if (!text)
        return text;
    let out = text;
    for (const [from, to] of REPLACEMENTS) {
        out = typeof to === "string" ? out.replace(from, to) : out.replace(from, to);
    }
    // Cleanup: doubled spaces, leading commas on a line, orphan spaces before
    // punctuation, double-comma runs.
    out = out
        .replace(/[ \t]{2,}/g, " ")
        .replace(/^\s*,\s*/gm, "")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/,\s*,+/g, ",")
        .replace(/\.\s*\.+/g, ".");
    return out;
}
