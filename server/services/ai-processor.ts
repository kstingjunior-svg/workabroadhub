import { openai } from "../lib/openai";
import { storage } from "../storage";
import type { ServiceOrder } from "@shared/schema";
import { sendWhatsApp } from "./whatsapp";
import { sendEmail } from "../email";

const APP_URL = process.env.APP_URL || "https://workabroadhub.tech";

interface IntakeData {
  fullName?: string;
  email?: string;
  phone?: string;
  targetCountry?: string;
  currentRole?: string;
  yearsExperience?: string;
  additionalInfo?: string;
  currentCvUrl?: string;
  linkedinUrl?: string;
}

interface AIOutput {
  content: string;
  type: string;
  metadata?: Record<string, any>;
}

interface QualityCheckResult {
  score: number;
  passed: boolean;
  issues: string[];
  suggestions: string[];
  checkDetails: Record<string, any>;
}

// Country-specific CV standards
const COUNTRY_CV_STANDARDS: Record<string, string> = {
  "Australia": `
## AUSTRALIAN CV STANDARDS (MANDATORY)
- Length: 2-3 pages maximum (CRITICAL)
- Professional Summary: REQUIRED at the top (3-4 sentences)
- Referees Section: REQUIRED - include "Referees available upon request" or actual referees
- ATS-Friendly: Use clean formatting, no tables, graphics, or columns
- EXCLUDE: Age, date of birth, gender, marital status, photo, nationality
- DO NOT include visa status or work rights claims
- Use Australian spelling (e.g., "organisation" not "organization")
- Include Key Skills section with 8-12 relevant skills
- Experience: Use reverse chronological order with achievements
`,
  "USA": `
## USA CV/RESUME STANDARDS (MANDATORY)
- Length: 1-2 pages maximum (1 page preferred for <10 years experience)
- Professional Summary: Required at the top
- NO photo, age, gender, marital status, or nationality
- Include quantified achievements with metrics
- Use action verbs and results-oriented language
- ATS-optimized formatting required
`,
  "Canada": `
## CANADIAN CV STANDARDS (MANDATORY)
- Length: 2 pages maximum
- Professional Summary: Required
- NO photo, age, gender, marital status
- Bilingual skills (English/French) highlighted if applicable
- Include volunteer work if relevant
- References available upon request
`,
  "UK": `
## UK CV STANDARDS (MANDATORY)
- Length: 2 pages maximum
- Personal Statement: Required at the top
- NO photo unless applying for acting/modeling
- NO date of birth, nationality, or marital status
- Include "References available upon request"
- Use British spelling throughout
`,
  "UAE": `
## UAE CV STANDARDS
- Length: 2-3 pages acceptable
- Photo: Optional but common in UAE
- Personal details: Can include nationality and visa status
- Highlight international experience
- Include languages spoken
`,
  "Europe": `
## EUROPEAN CV STANDARDS (EUROPASS COMPATIBLE)
- Length: 2 pages recommended
- Photo: Common in Germany, France, Italy
- Personal details: Varies by country
- Include language proficiency levels (A1-C2)
- Highlight cross-cultural experience
`
};

// Country-specific SOP standards
const COUNTRY_SOP_STANDARDS: Record<string, string> = {
  "USA": `
## USA SOP STANDARDS
- Length: 1-2 pages single-spaced (500-1000 words)
- Focus: Personal narrative, research interests, career goals
- Highlight: Leadership, innovation, diversity perspectives
- Include: Why this specific program, faculty you want to work with
- Avoid: Generic statements, excessive flattery
- Tone: Confident but humble, story-driven
`,
  "Canada": `
## CANADIAN SOP STANDARDS
- Length: 2 pages maximum (750-1000 words)
- Focus: Academic preparation, research experience, community involvement
- Highlight: Multilingual abilities, Canadian values alignment
- Include: How you'll contribute to the academic community
- Mention: Post-graduation plans in Canada if applicable
`,
  "UK": `
## UK SOP/PERSONAL STATEMENT STANDARDS
- Length: 500-1000 words (UCAS limit is 4000 characters)
- Focus: Academic interest, subject knowledge, intellectual curiosity
- Highlight: Independent thinking, analytical skills
- Structure: Subject-focused rather than life-story
- Avoid: American-style personal narratives
- Tone: Scholarly, focused on academic merit
`,
  "Australia": `
## AUSTRALIAN SOP STANDARDS
- Length: 500-1000 words
- Focus: Career goals, academic background, research interests
- Highlight: Work experience, professional development
- Include: How the program fits career trajectory
- Mention: Industry connections and practical applications
- Tone: Professional, career-focused
`,
  "UAE": `
## UAE SOP STANDARDS
- Length: 500-800 words
- Focus: Professional goals, leadership potential
- Highlight: International experience, cultural adaptability
- Include: How you'll contribute to UAE's vision
- Mention: Family support if relevant (common in region)
`,
  "Europe": `
## EUROPEAN SOP/MOTIVATION LETTER STANDARDS
- Length: 1-2 pages (varies by country/program)
- Germany: Focus on academic preparation, research interests
- France: Include cultural appreciation, language abilities
- Netherlands: Emphasize innovation, practical skills
- Format: Often called "Motivation Letter" rather than SOP
- Include: European mobility/Erasmus interest if applicable
`
};

// Country-specific Motivation Letter standards
const COUNTRY_MOTIVATION_LETTER_STANDARDS: Record<string, string> = {
  "USA": `
## USA MOTIVATION LETTER STANDARDS
- Length: 1 page maximum (400-500 words)
- Format: Professional business letter
- Focus: Specific achievements, measurable impact
- Highlight: Initiative, innovation, problem-solving
- Tone: Confident, action-oriented
`,
  "Canada": `
## CANADIAN MOTIVATION LETTER STANDARDS
- Length: 1 page (400-600 words)
- Format: Formal letter with professional greeting
- Focus: Skills, community contribution, values alignment
- Highlight: Bilingual abilities if applicable
- Include: Reference to Canadian culture/values
`,
  "UK": `
## UK MOTIVATION/COVERING LETTER STANDARDS
- Length: 1 page maximum
- Format: Formal British business letter
- Focus: Academic achievements, intellectual engagement
- Highlight: Subject expertise, research potential
- Tone: Reserved, scholarly, factual
- Avoid: Excessive enthusiasm or American-style energy
`,
  "Australia": `
## AUSTRALIAN MOTIVATION LETTER STANDARDS
- Length: 1 page (400-500 words)
- Format: Professional, straightforward
- Focus: Skills, experience, career goals
- Highlight: Practical experience, work ethic
- Tone: Direct, professional, friendly
- Include: Cultural fit and adaptability
`,
  "UAE": `
## UAE MOTIVATION LETTER STANDARDS
- Length: 1 page
- Format: Formal, respectful
- Focus: Professional achievements, leadership
- Highlight: Respect for local culture and values
- Include: Long-term commitment to the region
`,
  "Europe": `
## EUROPEAN MOTIVATION LETTER STANDARDS
- Length: 1 page (400-600 words)
- Germany: Formal, structured, fact-based
- France: Elegant, well-structured, show cultural awareness
- Netherlands: Direct, practical, innovative
- Include: Language skills, European experience
- Format: Often more formal than US/UK versions
`
};

function getCountryStandards(targetCountry: string): string {
  const country = targetCountry?.toLowerCase() || "";
  if (country.includes("australia")) return COUNTRY_CV_STANDARDS["Australia"];
  if (country.includes("usa") || country.includes("united states") || country.includes("america")) return COUNTRY_CV_STANDARDS["USA"];
  if (country.includes("canada")) return COUNTRY_CV_STANDARDS["Canada"];
  if (country.includes("uk") || country.includes("united kingdom") || country.includes("britain")) return COUNTRY_CV_STANDARDS["UK"];
  if (country.includes("uae") || country.includes("arab") || country.includes("emirates") || country.includes("dubai")) return COUNTRY_CV_STANDARDS["UAE"];
  if (country.includes("europe") || country.includes("germany") || country.includes("france") || country.includes("netherlands")) return COUNTRY_CV_STANDARDS["Europe"];
  return "";
}

function getSOPStandards(targetCountry: string): string {
  const country = targetCountry?.toLowerCase() || "";
  if (country.includes("australia")) return COUNTRY_SOP_STANDARDS["Australia"];
  if (country.includes("usa") || country.includes("united states") || country.includes("america")) return COUNTRY_SOP_STANDARDS["USA"];
  if (country.includes("canada")) return COUNTRY_SOP_STANDARDS["Canada"];
  if (country.includes("uk") || country.includes("united kingdom") || country.includes("britain")) return COUNTRY_SOP_STANDARDS["UK"];
  if (country.includes("uae") || country.includes("arab") || country.includes("emirates") || country.includes("dubai")) return COUNTRY_SOP_STANDARDS["UAE"];
  if (country.includes("europe") || country.includes("germany") || country.includes("france") || country.includes("netherlands")) return COUNTRY_SOP_STANDARDS["Europe"];
  return "";
}

function getMotivationLetterStandards(targetCountry: string): string {
  const country = targetCountry?.toLowerCase() || "";
  if (country.includes("australia")) return COUNTRY_MOTIVATION_LETTER_STANDARDS["Australia"];
  if (country.includes("usa") || country.includes("united states") || country.includes("america")) return COUNTRY_MOTIVATION_LETTER_STANDARDS["USA"];
  if (country.includes("canada")) return COUNTRY_MOTIVATION_LETTER_STANDARDS["Canada"];
  if (country.includes("uk") || country.includes("united kingdom") || country.includes("britain")) return COUNTRY_MOTIVATION_LETTER_STANDARDS["UK"];
  if (country.includes("uae") || country.includes("arab") || country.includes("emirates") || country.includes("dubai")) return COUNTRY_MOTIVATION_LETTER_STANDARDS["UAE"];
  if (country.includes("europe") || country.includes("germany") || country.includes("france") || country.includes("netherlands")) return COUNTRY_MOTIVATION_LETTER_STANDARDS["Europe"];
  return "";
}

const SERVICE_PROMPTS: Record<string, (intake: IntakeData) => string> = {
  "CV Rewrite": (intake) => `
You are a professional international recruitment consultant and CV writing expert with 15+ years experience placing candidates in ${intake.targetCountry || "international"} markets.

${getCountryStandards(intake.targetCountry || "")}

## STRICT OUTPUT REQUIREMENTS (FOR AUTO-APPROVAL)
- Format: Clean plain text, ATS-friendly (no tables, graphics, columns)
- Sections REQUIRED: Contact Info, Professional Summary, Skills (minimum 8 items), Experience, Education
- Language: Professional, error-free English
- Personalization: Must reference specific details from candidate info

## CRITICAL RULES - VIOLATIONS CAUSE REJECTION
- FACTUAL ACCURACY ONLY - use information provided, nothing invented
- NO fake companies (ABC Corp, XYZ Inc, Acme, Sample Company)
- NO fabricated certifications or credentials
- NO unrealistic statistics (500% increase, saved $10 million)
- NO placeholder text [insert here], [your name], etc.
- NO generic buzzwords (synergy, paradigm, guru, ninja, rockstar)
- Preserve candidate's authentic experience level

## CANDIDATE INFORMATION
- Name: ${intake.fullName || "Not provided"}
- Current Role: ${intake.currentRole || "Not provided"}
- Years of Experience: ${intake.yearsExperience || "Not provided"}
- Target Country: ${intake.targetCountry || "International"}
- LinkedIn: ${intake.linkedinUrl || "Not provided"}
- Additional Context: ${intake.additionalInfo || "None provided"}

## DELIVERABLE STRUCTURE
1. CONTACT HEADER: Use candidate's actual name (${intake.fullName || "Candidate Name"}), add professional contact line without brackets
2. PROFESSIONAL SUMMARY: 3-4 sentences highlighting ${intake.yearsExperience || "their"} years in ${intake.currentRole || "their field"}, tailored to ${intake.targetCountry || "international"} market
3. CORE SKILLS: 8-12 relevant skills in bullet format based on their role
4. PROFESSIONAL EXPERIENCE: Format existing experience with strong action verbs
5. EDUCATION: Standard format for qualifications
6. REFEREES: Include "Referees available upon request" (especially for Australia, UK, Canada)
7. ADDITIONAL SECTIONS: Certifications, languages, or projects if relevant to provided info

IMPORTANT: Never use bracketed placeholders like [insert], [your name], [company]. Use actual provided data or omit sections if data is missing.

Output a polished, ATS-optimized CV ready for ${intake.targetCountry || "international"} job applications.
`,

  "ATS CV Optimization": (intake) => `
You are a professional international recruitment consultant and ATS optimization expert.

${getCountryStandards(intake.targetCountry || "")}

Optimize the following CV for ATS systems used by employers in ${intake.targetCountry || "international"} markets (Taleo, Workday, Greenhouse, Lever).

Target Job Title: ${intake.currentRole || "Not specified"}
Target Country: ${intake.targetCountry || "International"}
Years of Experience: ${intake.yearsExperience || "Not specified"}
Key Skills to Emphasize: ${intake.additionalInfo || "Not specified"}
Candidate Name: ${intake.fullName || "Not provided"}
LinkedIn: ${intake.linkedinUrl || "Not provided"}

OPTIMIZATION INSTRUCTIONS:
1. Rewrite the CV to maximize ATS keyword matching for the target role and country
2. Use a clean ATS-friendly structure — no tables, columns, text boxes, or graphics
3. Use standard section headings: Summary, Work Experience, Education, Skills, Certifications
4. Strengthen bullet points with specific action verbs and quantified achievements where present
5. Inject role-relevant and country-relevant keywords at natural density
6. Keep content strictly factual — do NOT invent experience, qualifications, or achievements
7. Preserve all original facts, dates, company names, and job titles
8. Add "Referees available upon request" at the end

CRITICAL RULES:
- FACTUAL ACCURACY ONLY — use only the information provided
- Do NOT exaggerate responsibilities or invent achievements
- Do NOT add placeholder text like [Company Name] or [Your Name]

OUTPUT FORMAT — return exactly these three sections, in this order, with these exact headers:

ATS SCORE: {N}/100

KEY IMPROVEMENTS:
1. {improvement}
2. {improvement}
3. {improvement}
(list every meaningful change made, minimum 5 items)

---
OPTIMIZED CV:
{full rewritten CV in plain text, ready to paste}
`,

  "Cover Letter Writing": (intake) => `
You are a professional international recruitment consultant and cover letter expert specializing in ${intake.targetCountry || "international"} job markets.

## STRICT OUTPUT REQUIREMENTS (FOR AUTO-APPROVAL)
- Length: 250-400 words (approximately 1 page)
- Format: Professional letter format with proper greeting and sign-off
- Personalization: MUST reference candidate's specific role and experience
- Language: Error-free, professional English
- Tone: Confident but authentic, no exaggeration

## CRITICAL RULES - VIOLATIONS CAUSE REJECTION
- FACTUAL ACCURACY ONLY - use provided information
- NO invented achievements, projects, or qualifications
- NO placeholder text [Company Name], [Your Name], etc.
- NO generic phrases like "passionate about excellence" or "results-driven professional"
- NO promises about future performance or guarantees
- Use specific details from the candidate's background

## APPLICATION DETAILS
- Target Company: ${intake.additionalInfo?.split(',')[0]?.trim() || "Prospective Employer"}
- Target Role: ${intake.currentRole || "Target Position"}
- Target Country: ${intake.targetCountry || "International"}

## CANDIDATE INFORMATION
- Name: ${intake.fullName || "Candidate"}
- Current Position: ${intake.currentRole || "Professional"}
- Experience: ${intake.yearsExperience || "Several"} years
- LinkedIn: ${intake.linkedinUrl || "Available on request"}
- Background/Notes: ${intake.additionalInfo || "Career professional seeking new opportunities"}

## REQUIRED STRUCTURE
1. GREETING: Dear Hiring Manager (or Dear Recruitment Team)
2. OPENING PARAGRAPH: Hook that connects candidate's background to the role (2-3 sentences)
3. BODY PARAGRAPH 1: Relevant experience and skills from provided info (3-4 sentences)
4. BODY PARAGRAPH 2: Cultural awareness for ${intake.targetCountry || "international"} market, value proposition (2-3 sentences)
5. CLOSING: Professional call to action, availability for interview
6. SIGN-OFF: Professional closing with candidate's name (${intake.fullName || "Candidate"})

IMPORTANT: Never use bracketed placeholders. Use actual provided data or professional generic text.

Output a complete, polished cover letter ready for submission.
`,

  "LinkedIn Profile Optimization": (intake) => `
You are a professional international recruitment consultant and LinkedIn optimization expert.

Optimize this LinkedIn profile for recruiter search.
Focus on headline, about section, and experience.

CRITICAL RULES:
- Maintain FACTUAL ACCURACY - only reference provided experience
- Do NOT invent certifications, achievements, or skills
- Do NOT exaggerate job titles or responsibilities
- Preserve the candidate's authentic professional brand
- Use keywords recruiters actually search for

Professional Information:
- Name: ${intake.fullName || "Not provided"}
- Current Role: ${intake.currentRole || "Not provided"}
- Experience: ${intake.yearsExperience || "Not provided"} years
- Target Market: ${intake.targetCountry || "International"}
- Current LinkedIn: ${intake.linkedinUrl || "Not provided"}
- Goals/Background: ${intake.additionalInfo || "Career advancement"}

DELIVER THESE THREE SECTIONS:

1. HEADLINE (120 characters max):
   - Include target job title + key skills + value proposition
   - Use keywords recruiters search for in ${intake.targetCountry || "international"} market
   - Avoid buzzwords like "guru", "ninja", "rockstar"

2. ABOUT SECTION (2000 characters max):
   - Opening hook that captures attention
   - Clear value proposition based on actual experience
   - Key achievements (facts only, no fabrication)
   - Skills and expertise aligned with target roles
   - Call to action for recruiters

3. EXPERIENCE OPTIMIZATION:
   - Strong action verbs for bullet points
   - Quantified achievements where data is provided
   - Keywords matching target role requirements
   - Format recommendations for each position

Output in clear, copy-paste ready format.
`,

  "Interview Coaching": (intake) => `
You are a professional international recruitment consultant and interview coaching expert.

Create a comprehensive interview preparation guide for:
- Candidate: ${intake.fullName || "Not provided"}
- Target Role: ${intake.currentRole || "Not provided"}
- Experience Level: ${intake.yearsExperience || "Not provided"} years
- Target Country: ${intake.targetCountry || "International"}
- Special Notes: ${intake.additionalInfo || "None"}

CRITICAL RULES:
- Base all advice on the candidate's ACTUAL experience level
- Do NOT suggest claiming skills or experience they don't have
- Provide realistic expectations for their background
- Tailor cultural advice to the specific target market
- No generic cookie-cutter responses

DELIVER THESE SECTIONS:

1. ROLE-SPECIFIC QUESTIONS (10-15 questions):
   - Technical/skill-based questions for ${intake.currentRole || "the role"}
   - Behavioral questions common in ${intake.targetCountry || "international"} interviews
   - Situational judgment questions

2. STAR METHOD TEMPLATES:
   - Framework for structuring answers
   - 3 example templates based on their experience level

3. CULTURAL CONSIDERATIONS for ${intake.targetCountry || "International"}:
   - Interview etiquette and expectations
   - Communication style preferences
   - Dress code recommendations
   - Time and punctuality norms

4. QUESTIONS TO ASK INTERVIEWERS:
   - 5-7 thoughtful questions showing genuine interest
   - Questions appropriate for their experience level

5. PRACTICAL TIPS:
   - Virtual interview best practices
   - Body language and presentation
   - Salary negotiation strategies for ${intake.targetCountry || "the market"}
   - Follow-up etiquette

Output in clear, organized format ready for candidate use.
`,

  "Visa Guidance": (intake) => `
You are a professional immigration guidance specialist (NOT a lawyer).

Provide comprehensive visa information for:
- Applicant: ${intake.fullName || "Not provided"}
- Professional Background: ${intake.currentRole || "Not provided"} with ${intake.yearsExperience || "N/A"} years experience
- Target Destination: ${intake.targetCountry || "Not specified"}
- Additional Context: ${intake.additionalInfo || "None"}

CRITICAL RULES:
- This is INFORMATIONAL GUIDANCE ONLY - not legal advice
- Do NOT guarantee visa approval or timelines
- Do NOT invent visa categories or requirements
- Always recommend consulting official government sources
- Be clear about what information may be outdated

DELIVER THESE SECTIONS:

1. VISA OVERVIEW for ${intake.targetCountry || "the destination"}:
   - Common work visa categories for their profession
   - Brief description of each relevant visa type
   - Which might suit their profile (based on facts provided)

2. GENERAL REQUIREMENTS:
   - Typical eligibility criteria
   - Educational/experience requirements
   - Language requirements if applicable

3. DOCUMENTATION CHECKLIST:
   - Common documents needed
   - Authentication/apostille requirements
   - Professional credential recognition

4. TIMELINE & COSTS (ESTIMATES ONLY):
   - Typical processing times (subject to change)
   - Approximate fee ranges
   - Factors that affect processing

5. PREPARATION STEPS:
   - Recommended order of actions
   - Common mistakes to avoid
   - When to start the process

6. OFFICIAL RESOURCES:
   - Government immigration website for ${intake.targetCountry || "destination"}
   - Embassy/consulate information
   - Professional bodies for credential recognition

DISCLAIMER: Immigration laws change frequently. This information is for planning purposes only. Always verify current requirements with official government sources before making decisions.
`,

  "SOP / Statement of Purpose": (intake) => `
You are an expert academic writing consultant with 15+ years experience helping students gain admission to top universities in ${intake.targetCountry || "international"} markets.

## COUNTRY-SPECIFIC SOP STANDARDS
${getSOPStandards(intake.targetCountry || "")}

## STRICT OUTPUT REQUIREMENTS (FOR AUTO-APPROVAL)
- Length: 800-1200 words (approximately 2 pages single-spaced)
- Format: Clear paragraphs with logical flow
- Tone: Professional, authentic, and reflective
- Language: Error-free academic English
- Structure: Clear introduction, body paragraphs, and conclusion

## CRITICAL RULES - VIOLATIONS CAUSE REJECTION
- FACTUAL ACCURACY ONLY - use provided information, nothing invented
- NO fake achievements, research projects, or publications
- NO placeholder text [insert here], [university name], etc.
- NO clichés like "from a young age" or "passionate about"
- NO unrealistic claims or exaggerated accomplishments
- Preserve candidate's authentic voice and genuine motivations
- Do NOT fabricate grades, test scores, or academic honors

## APPLICANT INFORMATION
- Name: ${intake.fullName || "Not provided"}
- Current Role/Status: ${intake.currentRole || "Not provided"}
- Years of Experience/Study: ${intake.yearsExperience || "Not provided"}
- Target Country: ${intake.targetCountry || "International"}
- Target Program/University: ${intake.additionalInfo?.split(',')[0]?.trim() || "Graduate Program"}
- Background/Goals: ${intake.additionalInfo || "Academic and career advancement"}

## REQUIRED SOP STRUCTURE

1. OPENING HOOK (1 paragraph):
   - Compelling personal anecdote or insight related to the field
   - Clear statement of intent and target program
   - Avoid generic openings like "I have always been interested in..."

2. ACADEMIC BACKGROUND (1-2 paragraphs):
   - Relevant coursework, projects, or research based on provided info
   - How academic experiences shaped their interest
   - Key skills developed during studies
   
3. PROFESSIONAL/PRACTICAL EXPERIENCE (1-2 paragraphs):
   - Work experience, internships, or projects related to the field
   - Specific contributions and lessons learned
   - How experience connects to graduate study goals

4. WHY THIS PROGRAM/COUNTRY (1 paragraph):
   - Specific reasons for choosing ${intake.targetCountry || "this country"}
   - What they know about the program/institution
   - Faculty research interests or unique opportunities (if mentioned)

5. FUTURE GOALS (1 paragraph):
   - Short-term academic objectives
   - Long-term career aspirations
   - How the program bridges current position to goals

6. CONCLUSION (1 paragraph):
   - Summary of key motivations
   - What they will contribute to the program
   - Strong closing statement

IMPORTANT: Never use bracketed placeholders. Use actual provided data or write in a way that doesn't require specifics if data is missing.

Output a polished, compelling Statement of Purpose ready for ${intake.targetCountry || "international"} university applications.
`,

  "Contract Review": (intake) => `
You are a legal expert specialising in overseas employment contracts with deep knowledge of labour laws in ${intake.targetCountry || "international"} jurisdictions.

## CONTRACT REVIEW TASK
Analyse the following employment contract and produce a structured risk report.

Contract / Key Terms Provided:
${intake.additionalInfo || "[No contract text provided — produce a general guidance checklist for reviewing overseas employment contracts for ${intake.targetCountry || 'international'} roles]"}

Target Country: ${intake.targetCountry || "International"}
Role: ${intake.currentRole || "Not specified"}

## REPORT STRUCTURE (MANDATORY)

1. **OVERALL RISK RATING**: Low / Medium / High — with one-sentence justification

2. **CLAUSE-BY-CLAUSE ANALYSIS** — for each significant clause:
   - Clause topic (e.g. Salary, Termination, Working Hours)
   - Actual text or summary
   - Risk level: 🟢 Fair / 🟡 Caution / 🔴 Red Flag
   - Explanation of risk
   - Recommended question to ask employer

3. **TOP 5 RED FLAGS** (if any): Unfair clauses, vague terms, missing protections

4. **MISSING PROTECTIONS CHECKLIST**: Items a fair contract should include but this one omits

5. **RECOMMENDED ACTIONS**: 3–5 concrete steps before signing

Be thorough but practical. Assume the reader is a Kenyan worker without legal training.
`,

  "Employer Verification Report": (intake) => `
You are a due-diligence specialist helping Kenyan workers verify whether an overseas employer is legitimate before signing a contract.

## EMPLOYER VERIFICATION TASK
Generate a structured verification guidance report for:
Employer Name: ${intake.additionalInfo?.split(',')[0]?.trim() || "Employer provided by candidate"}
Country: ${intake.targetCountry || "International"}
Role Offered: ${intake.currentRole || "Not specified"}

## REPORT STRUCTURE (MANDATORY)

1. **LEGITIMACY SCORE**: Rate 1-10 based on the information provided, explain scoring criteria

2. **COMPANY REGISTRATION CHECK**:
   - Which government registry to check (country-specific)
   - Exact URL and search instructions
   - What a legitimate registration looks like vs a fake

3. **ONLINE PRESENCE ANALYSIS**:
   - How to verify the company website, LinkedIn, and reviews
   - Red flags in online presence

4. **KNOWN SCAM INDICATORS**:
   - List 10 specific warning signs to watch for
   - Fee requests, vague job descriptions, pressure tactics

5. **VERIFICATION STEPS** (step-by-step action plan):
   - Who to contact in ${intake.targetCountry || "the destination country"}
   - Kenya Embassy / NEA verification process
   - Background check services available

6. **RECOMMENDATION**: Should the candidate proceed, proceed with caution, or avoid?

Note: This is a guidance report for the candidate, not a legal guarantee.
`,

  "Pre-Departure Orientation Pack": (intake) => `
You are an experienced overseas employment counsellor who has helped thousands of Kenyan workers relocate to ${intake.targetCountry || "international"} markets.

## PRE-DEPARTURE ORIENTATION PACK
Create a comprehensive pre-departure guide for:
Destination: ${intake.targetCountry || "International"}
Candidate Role: ${intake.currentRole || "Worker"}
Name: ${intake.fullName || "Candidate"}

## GUIDE STRUCTURE (MANDATORY — all sections required)

1. **ARRIVAL ESSENTIALS**
   - First 48 hours checklist
   - Airport to accommodation guidance
   - Important apps to download before departure

2. **HOUSING & ACCOMMODATION**
   - Average rental costs by area
   - How to find legitimate housing
   - Scams to avoid in the rental market
   - Typical lease terms

3. **BANKING & MONEY**
   - How to open a bank account as an immigrant
   - Best money transfer services to send money home to Kenya
   - Cost of living overview with typical monthly budget

4. **WORKER RIGHTS & LABOUR LAW** (country-specific for ${intake.targetCountry})
   - Maximum working hours and overtime rules
   - Minimum wage / salary protections
   - Annual leave and sick leave entitlements
   - How to report employer abuse

5. **CULTURAL GUIDE**
   - 10 cultural dos and don'ts
   - Religion and customs awareness
   - Social norms at the workplace

6. **EMERGENCY CONTACTS**
   - Kenya Embassy / High Commission in ${intake.targetCountry || "the destination country"}: address, phone, email
   - Local emergency numbers (police, ambulance, fire)
   - NEA Kenya helpline
   - WorkAbroad Hub support: +254 700 000 000

7. **STAYING CONNECTED**
   - How to get a local SIM card
   - Affordable international calling options
   - Kenya community groups in ${intake.targetCountry}

Format as a practical, easy-to-read guide. Use bullet points and clear headings throughout.
`,

  "Guided Application Strategy": (intake) => `
You are a senior international job placement specialist with expertise in ${intake.targetCountry || "international"} job markets.

## GUIDED APPLICATION STRATEGY
Create a personalised 5-application job search strategy for:
Name: ${intake.fullName || "Candidate"}
Target Role: ${intake.currentRole || "Not specified"}
Target Country: ${intake.targetCountry || "International"}
Experience: ${intake.yearsExperience || "Several"} years
Background: ${intake.additionalInfo || "Professional seeking overseas employment"}

## STRATEGY DOCUMENT (MANDATORY SECTIONS)

1. **MARKET OVERVIEW**
   - Demand for ${intake.currentRole || "your target role"} in ${intake.targetCountry || "the target country"}
   - Salary range (local currency + KES equivalent)
   - Key industries/sectors hiring

2. **TOP 5 JOB PORTALS** (country-specific with direct links)
   - Portal name, URL, best job categories, how to optimise your profile

3. **5 TARGETED APPLICATIONS** — for each application:
   - Suggested company/employer type
   - Role title to search
   - How to tailor the CV for this specific application
   - Cover letter angle
   - Application tips

4. **CV OPTIMISATION CHECKLIST** for ${intake.targetCountry || "target country"}
   - 10 specific changes to make to your CV before applying

5. **COVER LETTER TEMPLATE** (customisable)
   - Fully written, with [COMPANY NAME] and [ROLE] as the only placeholders

6. **APPLICATION TRACKING SYSTEM**
   - Google Sheets column structure to track all 5 applications
   - Follow-up email templates (1 week, 2 weeks post-application)

7. **WEEKLY ACTION PLAN** (4 weeks)
   - Concrete weekly targets and actions

Format as a practical, actionable document the candidate can start using immediately.
`,

  "Application Tracking System": (intake) => `
You are a career coach specialising in systematic job search strategies for overseas employment.

## APPLICATION TRACKING SYSTEM
Create a personalised application tracking and management system for:
Name: ${intake.fullName || "Candidate"}
Target Role: ${intake.currentRole || "Not specified"}
Target Country: ${intake.targetCountry || "International"}

## DELIVERABLES (all required)

1. **GOOGLE SHEETS TEMPLATE STRUCTURE**
   - Exact column headers with descriptions
   - Dropdown options for Status column (Applied, Interview Scheduled, Interview Done, Offer Received, Rejected, Withdrawn)
   - Colour-coding guide (copy exactly into your sheet)
   - Formulas for automatic follow-up date calculation

2. **WEEKLY REVIEW TEMPLATE**
   - A fill-in-the-blank weekly review format to track progress
   - KPIs to track: applications sent, responses received, interviews, offers

3. **FOLLOW-UP EMAIL TEMPLATES** (ready to copy-paste)
   - 1-week follow-up after application
   - Post-interview thank-you note
   - 2-week check-in if no response

4. **REJECTION RECOVERY PROTOCOL**
   - 5-step process to handle rejection constructively
   - How to request feedback from employers
   - How to iterate your application based on rejection patterns

5. **SUCCESS METRICS & MILESTONES**
   - What a healthy application funnel looks like
   - Weekly targets: minimum applications, outreach, networking

6. **30-60-90 DAY JOB SEARCH ROADMAP** for ${intake.targetCountry || "target country"}
   - Week-by-week action plan
   - Key milestones and decision points

Format clearly with tables and bullet points for easy copy-paste into Google Sheets or Notion.
`,

  "Reminder System": (intake) => `
You are a career coach helping overseas job seekers stay organised and never miss a deadline.

## PERSONALISED DEADLINE REMINDER SYSTEM
Create a complete reminder and tracking system for:
Name: ${intake.fullName || "Candidate"}
Target Country: ${intake.targetCountry || "International"}
Key Deadlines: ${intake.additionalInfo || "Visa, application, and document expiry dates"}

## DELIVERABLES (all required)

1. **CALENDAR SETUP GUIDE**
   - Google Calendar step-by-step: how to create a dedicated "Job Search" calendar
   - Outlook alternative for Windows users
   - How to enable email + push notifications

2. **REMINDER SCHEDULE TEMPLATE** (for each deadline)
   - 4 weeks before: Initial preparation reminder
   - 2 weeks before: Progress check and document gathering
   - 1 week before: Final preparation checklist
   - 3 days before: Last-chance review
   - 1 day before: Final confirmation

3. **SMS/WHATSAPP REMINDER TEMPLATE** (copy-paste ready)
   - Self-reminder message format
   - Accountability partner message format

4. **EMAIL REMINDER TEMPLATE** (copy-paste ready)
   - Subject line formula
   - Body with checklist items

5. **TRACKING SPREADSHEET STRUCTURE**
   - Columns: Deadline Name, Due Date, Category, Status, Notes, Reminder Sent
   - Formula for days-remaining countdown

6. **HIGH-PRIORITY DEADLINES CHECKLIST** for ${intake.targetCountry || "international"} job seekers:
   - Visa application window
   - Document authentication timelines
   - Work permit renewal dates
   - Application submission deadlines

Format as a practical, easy-to-follow guide. Include copy-paste ready templates throughout.
`,

  "Motivation Letter Writing": (intake) => `
You are an expert career and academic writing consultant specializing in motivation letters for scholarships, jobs, and study programs in ${intake.targetCountry || "international"} markets.

## COUNTRY-SPECIFIC MOTIVATION LETTER STANDARDS
${getMotivationLetterStandards(intake.targetCountry || "")}

## STRICT OUTPUT REQUIREMENTS (FOR AUTO-APPROVAL)
- Length: 400-600 words (approximately 1 page)
- Format: Professional letter format with clear paragraphs
- Tone: Enthusiastic but professional, authentic and genuine
- Language: Error-free English with appropriate formality
- Personalization: MUST reference specific details from candidate

## CRITICAL RULES - VIOLATIONS CAUSE REJECTION
- FACTUAL ACCURACY ONLY - use provided information
- NO invented achievements, awards, or qualifications
- NO placeholder text [Company Name], [Scholarship Name], etc.
- NO generic phrases like "I am the ideal candidate"
- NO empty claims without supporting evidence from provided info
- Be specific, not generic - use actual details provided

## APPLICANT INFORMATION
- Name: ${intake.fullName || "Candidate"}
- Current Status: ${intake.currentRole || "Professional/Student"}
- Experience Level: ${intake.yearsExperience || "Several"} years
- Target Country: ${intake.targetCountry || "International"}
- Application Type: ${intake.additionalInfo?.split(',')[0]?.trim() || "Scholarship/Program Application"}
- Background/Context: ${intake.additionalInfo || "Seeking new opportunities abroad"}

## MOTIVATION LETTER STRUCTURE

1. HEADER & GREETING:
   - Professional salutation: "Dear Selection Committee" or "Dear Scholarship Board"
   - Reference to specific opportunity if mentioned

2. OPENING PARAGRAPH (2-3 sentences):
   - State the purpose clearly
   - Express genuine interest with a compelling hook
   - Connect your background briefly to the opportunity

3. BODY PARAGRAPH 1 - WHY YOU (3-4 sentences):
   - Relevant qualifications and experience from provided info
   - Specific achievements that demonstrate capability
   - Skills that make you suitable for this opportunity

4. BODY PARAGRAPH 2 - WHY THIS OPPORTUNITY (3-4 sentences):
   - Specific reasons for interest in this program/scholarship/role
   - What attracts you to ${intake.targetCountry || "the destination"}
   - How this aligns with your goals

5. BODY PARAGRAPH 3 - FUTURE IMPACT (2-3 sentences):
   - What you will contribute if selected
   - How you plan to use this opportunity
   - Long-term vision connected to the opportunity

6. CLOSING (2-3 sentences):
   - Reiterate enthusiasm and fit
   - Express availability for interview/next steps
   - Professional sign-off with candidate name (${intake.fullName || "Candidate"})

IMPORTANT: Never use bracketed placeholders. Use actual provided data or professional generic text.

Output a complete, compelling motivation letter ready for submission.
`,
};

// Hallucination Detection Rules
const HALLUCINATION_PATTERNS = {
  // Fake company/organization patterns
  fakeCompanies: [
    /(?:worked at|employed by|joined)\s+(?:ABC|XYZ|Acme|Sample|Example|Test)\s+(?:Corp|Inc|Ltd|Company)/gi,
    /\b(?:Fortune\s+\d+|Top\s+\d+)\s+company\b/gi, // Generic claims without specifics
  ],
  
  // Fabricated credentials
  fakeCredentials: [
    /(?:certified|licensed)\s+(?:by|from)\s+(?:the\s+)?(?:International|Global|World)\s+(?:Board|Institute|Academy)/gi,
    /\b(?:PhD|MBA|Masters?)\s+(?:from|at)\s+(?:a\s+)?(?:prestigious|top|leading)\s+(?:university|institution)\b/gi,
  ],
  
  // Invented statistics without source
  unsourcedStats: [
    /increased\s+(?:sales|revenue|productivity|efficiency)\s+by\s+(?:\d{3,}%|\d+x)/gi, // Unrealistic percentages
    /saved\s+(?:the\s+)?company\s+\$?\d{1,3}(?:,\d{3})*(?:\s+million|\s+billion)?/gi,
    /managed\s+(?:a\s+)?(?:team|budget)\s+of\s+(?:\d{4,}|\d+\s+(?:million|billion))/gi,
  ],
  
  // Generic filler content
  genericFiller: [
    /(?:dynamic|synergy|leverage|paradigm|holistic|proactive)\s+(?:approach|solution|strategy)/gi,
    /passionate\s+about\s+(?:excellence|innovation|success|growth)/gi,
    /(?:results-driven|detail-oriented|team\s+player)\s+(?:professional|individual)/gi,
  ],
  
  // Placeholder text patterns
  placeholders: [
    /\[(?:your|insert|add|company|name|date|number|role)\s*(?:here)?\]/gi,
    /(?:lorem\s+ipsum|sample\s+text|placeholder)/gi,
    /<(?:your|insert|add)\s+[^>]+>/gi,
  ],
  
  // Invented awards/recognition
  fakeAwards: [
    /(?:won|received|awarded)\s+(?:the\s+)?(?:prestigious|coveted|highly\s+acclaimed)\s+(?:award|recognition|prize)/gi,
    /(?:recognized|honored)\s+(?:by|as)\s+(?:industry|global|international)\s+(?:leader|expert|authority)/gi,
  ],
};

// Function to detect hallucinations in content
function detectHallucinations(content: string, clientInfo: IntakeData): {
  detected: boolean;
  patterns: string[];
  riskLevel: "low" | "medium" | "high";
  details: string[];
} {
  const detectedPatterns: string[] = [];
  const details: string[] = [];
  
  // Check each pattern category
  for (const [category, patterns] of Object.entries(HALLUCINATION_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        detectedPatterns.push(category);
        details.push(`${category}: "${matches[0]}"`);
      }
    }
  }
  
  // Cross-reference with client info
  const clientName = clientInfo.fullName?.toLowerCase() || "";
  const clientRole = clientInfo.currentRole?.toLowerCase() || "";
  
  // Check for names/roles that don't match
  if (clientName && content.toLowerCase().includes("john doe")) {
    detectedPatterns.push("placeholder_name");
    details.push("Contains placeholder name 'John Doe'");
  }
  
  // Check for experience mismatch
  const experienceYears = parseInt(clientInfo.yearsExperience || "0");
  const seniorPattern = /(?:senior|lead|principal|director|vp|vice\s+president|c-level|cto|cfo|ceo)/gi;
  if (experienceYears < 5 && seniorPattern.test(content)) {
    detectedPatterns.push("experience_mismatch");
    details.push(`Senior titles claimed with only ${experienceYears} years experience`);
  }
  
  // Calculate risk level
  const uniquePatterns = Array.from(new Set(detectedPatterns));
  let riskLevel: "low" | "medium" | "high" = "low";
  if (uniquePatterns.length >= 3) riskLevel = "high";
  else if (uniquePatterns.length >= 1) riskLevel = "medium";
  
  return {
    detected: uniquePatterns.length > 0,
    patterns: uniquePatterns,
    riskLevel,
    details,
  };
}

const QUALITY_CHECK_PROMPT = `
You are a quality assurance specialist reviewing AI-generated career service content.

Evaluate the following content and provide a quality assessment:

CONTENT TO REVIEW:
{content}

SERVICE TYPE: {serviceType}
CLIENT INFO: {clientInfo}

AUTOMATIC FAIL CONDITIONS - Apply ONLY those relevant to the SERVICE TYPE above:

For CV / Resume services (CV Rewrite, ATS CV Optimization):
| Condition                          | Reason          |
| ---------------------------------- | --------------- |
| CV length > 4 pages                | ATS risk        |
| Missing key sections (Contact, Experience, Education, Skills) | Low quality |

For LinkedIn Profile Optimization:
| Condition                          | Reason          |
| ---------------------------------- | --------------- |
| Missing any of these 3 sections: HEADLINE, ABOUT SECTION, EXPERIENCE OPTIMIZATION | Incomplete |
| Headline exceeds 120 characters    | LinkedIn limit  |

For Cover Letter / Motivation Letter / SOP:
| Condition                          | Reason          |
| ---------------------------------- | --------------- |
| Length < 200 words or > 1500 words | Wrong length    |

For ALL service types:
| Condition                          | Reason          |
| ---------------------------------- | --------------- |
| Job title mismatch with target role | User confusion  |
| Obvious hallucinations detected (invented facts, companies, credentials) | Legal risk |
| Language quality score < 60        | Reputation risk |
| Unprofessional tone or formatting  | Quality issue   |
| Generic/template content without personalization | Poor value |

Score the content on these criteria (0-100 scale):
1. Relevance - Does it address the client's specific needs?
2. Professionalism - Is the tone and format appropriate?
3. Completeness - Are all required elements included?
4. Accuracy - Is the information accurate and NOT fabricated?
5. Personalization - Is it tailored to the individual?
6. Language Quality - Grammar, spelling, clarity

Provide your response in this exact JSON format:
{
  "overallScore": <0-100>,
  "estimatedPages": <number of pages the content would fill when formatted>,
  "criteriaScores": {
    "relevance": <0-100>,
    "professionalism": <0-100>,
    "completeness": <0-100>,
    "accuracy": <0-100>,
    "personalization": <0-100>,
    "languageQuality": <0-100>
  },
  "failConditions": ["list any automatic fail conditions triggered from the table above"],
  "issues": ["list of specific issues found"],
  "suggestions": ["list of improvement suggestions"],
  "passed": <true if overallScore >= 75 AND no failConditions, false otherwise>
}
`;

export async function processOrderWithAI(order: ServiceOrder): Promise<{
  success: boolean;
  output?: AIOutput;
  qualityCheck?: QualityCheckResult;
  error?: string;
}> {
  try {
    const intake = (order.intakeData || {}) as IntakeData;
    const serviceName = order.serviceName;

    // Explicit alias map: DB service name → prompt key (handles name variations)
    const SERVICE_NAME_ALIASES: Record<string, string> = {
      // Full-name variants
      "Country-Specific CV Rewrite": "CV Rewrite",
      "Interview Preparation Pack": "Interview Coaching",
      "Interview Pack": "Interview Coaching",
      "Visa Guidance Session": "Visa Guidance",
      "ATS + Cover Letter Bundle": "ATS CV Optimization",
      "Contract Review": "Contract Review",
      "Employer Verification": "Employer Verification Report",
      "Pre-Departure Pack": "Pre-Departure Orientation Pack",
      "Guided Application": "Guided Application Strategy",
      "Application Tracking": "Application Tracking System",
      // Snake_case IDs from the spec
      "ats_cv": "ATS CV Optimization",
      "country_cv": "CV Rewrite",
      "cover_letter": "Cover Letter Writing",
      "linkedin": "LinkedIn Profile Optimization",
      "interview_coaching": "Interview Coaching",
      "interview_pack": "Interview Coaching",
      "visa_guidance": "Visa Guidance",
      "sop": "SOP / Statement of Purpose",
      "motivation_letter": "Motivation Letter Writing",
      "contract_review": "Contract Review",
      "employer_verification": "Employer Verification Report",
      "pre_departure": "Pre-Departure Orientation Pack",
      "guided_apply": "Guided Application Strategy",
      "app_tracking": "Application Tracking System",
      "reminder_alerts": "Reminder System",
    };

    // Find matching prompt or use generic
    const canonicalName = SERVICE_NAME_ALIASES[serviceName] || serviceName;
    let promptFn = SERVICE_PROMPTS[canonicalName];
    if (!promptFn) {
      // Try partial match as fallback
      for (const [key, fn] of Object.entries(SERVICE_PROMPTS)) {
        if (serviceName.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(serviceName.toLowerCase())) {
          promptFn = fn;
          break;
        }
      }
    }

    if (!promptFn) {
      // Generic prompt for unknown services
      promptFn = (intake: IntakeData) => `
You are a professional career services expert. Provide assistance for:

Service Requested: ${serviceName}
Client: ${intake.fullName || "Not provided"}
Background: ${intake.currentRole || "Not provided"} with ${intake.yearsExperience || "N/A"} years experience
Target Market: ${intake.targetCountry || "International"}
Additional Info: ${intake.additionalInfo || "None"}

Provide comprehensive, professional assistance tailored to the client's needs.
`;
    }

    // Generate AI content using cost-effective model
    // GPT-4o-mini is ~80% cheaper than GPT-4o with comparable quality for document generation
    // CV services return more content (score + improvements + full rewritten CV) so get extra tokens
    const isCvService = serviceName.toLowerCase().includes("cv") || serviceName.toLowerCase().includes("resume");
    const prompt = promptFn(intake);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional career services expert providing high-quality, personalized assistance." },
        { role: "user", content: prompt }
      ],
      max_tokens: isCvService ? 3000 : 2000,
      temperature: 0.7,
    });

    const aiContent = completion.choices[0]?.message?.content || "";

    if (!aiContent) {
      return { success: false, error: "AI generated empty content" };
    }

    const aiOutput: AIOutput = {
      content: aiContent,
      type: serviceName,
      metadata: {
        model: "gpt-4o-mini",
        tokensUsed: completion.usage?.total_tokens || 0,
        generatedAt: new Date().toISOString(),
      },
    };

    // Run quality check
    const qualityCheck = await runQualityCheck(aiContent, serviceName, intake);

    return {
      success: true,
      output: aiOutput,
      qualityCheck,
    };
  } catch (error) {
    console.error("AI processing error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function runQualityCheck(
  content: string,
  serviceType: string,
  clientInfo: IntakeData
): Promise<QualityCheckResult> {
  try {
    const prompt = QUALITY_CHECK_PROMPT
      .replace("{content}", content.substring(0, 3000)) // Limit content length
      .replace("{serviceType}", serviceType)
      .replace("{clientInfo}", JSON.stringify(clientInfo, null, 2));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a quality assurance specialist. Always respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const result = JSON.parse(responseText);

    // Extract check criteria from AI response
    const criteriaScores = result.criteriaScores || {};
    const failConditions = result.failConditions || [];
    
    // Normalize language score to 0-1 scale (AI returns 0-100)
    const languageScore = (criteriaScores.languageQuality || 75) / 100;
    
    // Check for specific fail conditions from AI
    const pages = result.estimatedPages || 0;
    const missingSections = failConditions.some((fc: string) => 
      fc.toLowerCase().includes("missing") || fc.toLowerCase().includes("section")
    );
    const aiHallucinationDetected = failConditions.some((fc: string) => 
      fc.toLowerCase().includes("hallucination") || 
      fc.toLowerCase().includes("invented") || 
      fc.toLowerCase().includes("fabricat")
    );
    
    // Run local hallucination detection (pattern-based)
    const localHallucinationCheck = detectHallucinations(content, clientInfo);
    const hallucinationDetected = aiHallucinationDetected || localHallucinationCheck.detected;
    
    // Apply explicit flagging logic
    let status: "FLAGGED_FOR_REVIEW" | "AUTO_APPROVED";
    const issues: string[] = [...(result.issues || [])];
    
    if (
      pages > 4 ||
      missingSections ||
      hallucinationDetected ||
      languageScore < 0.75
    ) {
      status = "FLAGGED_FOR_REVIEW";
      
      // Add specific reasons to issues
      if (pages > 4) issues.push(`FAIL: CV exceeds 4 pages (${pages} pages detected) - ATS risk`);
      if (missingSections) issues.push("FAIL: Missing key sections - Low quality");
      if (hallucinationDetected) {
        issues.push("FAIL: Potential hallucinations detected - Legal risk");
        if (localHallucinationCheck.detected) {
          issues.push(...localHallucinationCheck.details.map(d => `HALLUCINATION: ${d}`));
        }
      }
      if (languageScore < 0.75) issues.push(`FAIL: Language quality below threshold (${Math.round(languageScore * 100)}%) - Reputation risk`);
    } else {
      status = "AUTO_APPROVED";
    }
    
    const passed = status === "AUTO_APPROVED" && (result.overallScore || 0) >= 75;

    return {
      score: result.overallScore || 0,
      passed,
      issues: [...issues, ...failConditions.map((fc: string) => `CONDITION: ${fc}`)],
      suggestions: result.suggestions || [],
      checkDetails: {
        ...criteriaScores,
        status,
        pages,
        missingSections,
        hallucinationDetected,
        hallucinationRisk: localHallucinationCheck.riskLevel,
        hallucinationPatterns: localHallucinationCheck.patterns,
        languageScore,
        failConditions,
      },
    };
  } catch (error) {
    console.error("Quality check error:", error);
    // Default to requiring human review on quality check failure
    return {
      score: 0,
      passed: false,
      issues: ["Quality check failed - requires human review"],
      suggestions: [],
      checkDetails: { error: error instanceof Error ? error.message : "Unknown error" },
    };
  }
}

export async function processAndDeliverOrder(orderId: string): Promise<{
  success: boolean;
  autoDelivered: boolean;
  needsReview: boolean;
  error?: string;
}> {
  try {
    const order = await storage.getServiceOrderById(orderId);
    if (!order) {
      return { success: false, autoDelivered: false, needsReview: false, error: "Order not found" };
    }

    if (order.status !== "processing") {
      return { success: false, autoDelivered: false, needsReview: false, error: "Order not in processing status" };
    }

    // Process with AI
    const result = await processOrderWithAI(order);

    if (!result.success) {
      // AI processing failed - flag for human review
      await storage.updateServiceOrder(orderId, {
        needsHumanReview: true,
        adminNotes: `AI processing failed: ${result.error}`,
      });
      // Notify user so they know it hasn't been forgotten
      await storage.createUserNotification({
        userId: order.userId,
        orderId,
        title: "Order Under Expert Review",
        message: `Your ${order.serviceName} is being personally reviewed by our team and will be delivered within 24 hours. We'll notify you as soon as it's ready.`,
        type: "order_update",
      }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      return { success: false, autoDelivered: false, needsReview: true, error: result.error };
    }

    // Update order with AI output and quality check results
    const updateData: any = {
      aiProcessedAt: new Date(),
      aiOutput: result.output,
      qualityScore: result.qualityCheck?.score || 0,
      qualityPassed: result.qualityCheck?.passed || false,
      qualityCheckData: result.qualityCheck,
    };

    if (result.qualityCheck?.passed) {
      // Quality passed - auto-deliver
      updateData.status = "completed";
      updateData.completedAt = new Date();
      updateData.needsHumanReview = false;

      // Create deliverable from AI output
      await storage.createDeliverable({
        orderId,
        fileName: `${order.serviceName.replace(/\s+/g, "_")}_${Date.now()}.txt`,
        fileType: "text/plain",
        fileUrl: `data:text/plain;base64,${Buffer.from(result.output?.content || "").toString("base64")}`,
        description: `AI-generated ${order.serviceName}`,
        uploadedBy: "AI_PROCESSOR",
      });

      // Notify user via DB notification
      await storage.createUserNotification({
        userId: order.userId,
        orderId,
        title: "Order Completed",
        message: `Your ${order.serviceName} is ready! You can now download your deliverables.`,
        type: "success",
      });

      await storage.updateServiceOrder(orderId, { ...updateData, userNotifiedAt: new Date() });

      // ── Deliver via WhatsApp + Email (fire-and-forget) ──────────────────
      const intake = (order.intakeData || {}) as IntakeData;
      const dashboardUrl = `${APP_URL}/dashboard/orders/${orderId}`;
      const preview = (result.output?.content || "").substring(0, 600);
      const hasMoreContent = (result.output?.content || "").length > 600;

      // WhatsApp delivery
      const userPhone = intake.phone;
      if (userPhone) {
        const waMsg =
          `🎉 *Your ${order.serviceName} is Ready!*\n\n` +
          `${preview}${hasMoreContent ? "...\n\n_(Full document available on dashboard)_" : ""}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📎 *View Full Document:*\n${dashboardUrl}\n\n` +
          `💬 Reply *Revise* for changes\n` +
          `📞 Need help? WhatsApp us any time`;
        sendWhatsApp(userPhone, waMsg).catch((err: Error) =>
          console.error(`[AIProcessor] WhatsApp delivery failed for order ${orderId}:`, err.message)
        );
      }

      // Email delivery
      const userEmail = intake.email;
      if (userEmail) {
        const escapedName = (intake.fullName || "Valued Client").replace(/[<>&"']/g, "");
        const escapedService = order.serviceName.replace(/[<>&"']/g, "");
        sendEmail({
          to: userEmail,
          subject: `Your ${order.serviceName} is Ready — WorkAbroad Hub`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <h2 style="color:#0891b2">🎉 Your ${escapedService} is Ready!</h2>
              <p>Hi ${escapedName},</p>
              <p>Great news — your document has been prepared and is ready to view on your dashboard.</p>
              <div style="background:#f0f9ff;border-left:4px solid #0891b2;padding:16px;margin:16px 0;border-radius:4px">
                <pre style="white-space:pre-wrap;font-size:13px;color:#1e3a5f">${preview.replace(/[<>&]/g, c => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;")}${hasMoreContent ? "\n\n...(continued on dashboard)" : ""}</pre>
              </div>
              <p style="margin-top:24px">
                <a href="${dashboardUrl}" style="background:#0891b2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
                  View Full Document →
                </a>
              </p>
              <p style="color:#64748b;font-size:13px;margin-top:24px">
                Need revisions? Reply to this email or WhatsApp us and we'll be happy to help.<br>
                — The WorkAbroad Hub Team
              </p>
            </div>
          `,
        }).catch((err: Error) =>
          console.error(`[AIProcessor] Email delivery failed for order ${orderId}:`, err.message)
        );
      }

      return { success: true, autoDelivered: true, needsReview: false };
    } else {
      // Quality failed - flag for human review
      updateData.needsHumanReview = true;
      updateData.adminNotes = `Quality check failed (score: ${result.qualityCheck?.score}). Issues: ${result.qualityCheck?.issues?.join(", ")}`;

      await storage.updateServiceOrder(orderId, updateData);

      // Notify user so they know it's under manual review, not forgotten
      await storage.createUserNotification({
        userId: order.userId,
        orderId,
        title: "Order Under Expert Review",
        message: `Our quality system flagged your ${order.serviceName} for a personal expert review to ensure the highest standard. You'll receive the final deliverable within 24 hours.`,
        type: "order_update",
      }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      return { success: true, autoDelivered: false, needsReview: true };
    }
  } catch (error) {
    console.error("Process and deliver error:", error);
    return {
      success: false,
      autoDelivered: false,
      needsReview: true,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function processQueue(): Promise<{
  processed: number;
  autoDelivered: number;
  flaggedForReview: number;
  errors: number;
}> {
  const stats = { processed: 0, autoDelivered: 0, flaggedForReview: 0, errors: 0 };

  try {
    // Get all orders in processing status
    const orders = await storage.getServiceOrders({ status: "processing" });

    for (const order of orders) {
      // Skip orders already processed by AI
      if (order.aiProcessedAt) continue;

      const result = await processAndDeliverOrder(order.id);
      stats.processed++;

      if (result.autoDelivered) {
        stats.autoDelivered++;
      } else if (result.needsReview) {
        stats.flaggedForReview++;
      }

      if (!result.success) {
        stats.errors++;
      }

      // Small delay between processing to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error("Queue processing error:", error);
  }

  return stats;
}
