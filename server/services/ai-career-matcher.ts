import { openai } from "../lib/openai";

interface UserProfile {
  currentJobTitle?: string | null;
  yearsExperience?: number | null;
  educationLevel?: string | null;
  fieldOfStudy?: string | null;
  skills: string[];
  certifications: string[];
  languages: { language: string; proficiency: string }[];
  preferredCountries: string[];
  preferredIndustries: string[];
  salaryExpectation?: number | null;
  willingToRelocate: boolean;
  familySize: number;
  hasPassport: boolean;
  hasWorkExperienceAbroad: boolean;
}

interface CountryInsight {
  countryCode: string;
  avgSalaryUsd: number;
  visaDifficulty: string;
  demandSectors: string[];
  workVisaTypes: { name: string; requirements: string; processingTime: string }[];
}

interface AIRecommendations {
  topCountries: { country: string; score: number; reason: string }[];
  topJobs: { title: string; country: string; salaryRange: string; reason: string }[];
  actionItems: string[];
  strengthsAnalysis: string;
  improvementAreas: string[];
}

export async function analyzeCareerProfile(
  profile: UserProfile,
  countryInsights: CountryInsight[]
): Promise<AIRecommendations> {
  const countryData = countryInsights.map(c => ({
    country: c.countryCode.toUpperCase(),
    avgSalary: c.avgSalaryUsd,
    visaDifficulty: c.visaDifficulty,
    demandSectors: c.demandSectors,
    visaOptions: c.workVisaTypes.map(v => v.name).join(", ")
  }));

  const prompt = `You are a career advisor for Kenyans seeking overseas employment. Analyze this user's profile and provide personalized recommendations.

USER PROFILE:
- Current Job: ${profile.currentJobTitle || "Not specified"}
- Years of Experience: ${profile.yearsExperience || 0}
- Education: ${profile.educationLevel || "Not specified"} in ${profile.fieldOfStudy || "Not specified"}
- Skills: ${profile.skills.length > 0 ? profile.skills.join(", ") : "Not specified"}
- Certifications: ${profile.certifications.length > 0 ? profile.certifications.join(", ") : "None"}
- Languages: ${profile.languages.map(l => `${l.language} (${l.proficiency})`).join(", ") || "Not specified"}
- Preferred Countries: ${profile.preferredCountries.length > 0 ? profile.preferredCountries.join(", ") : "Open to all"}
- Preferred Industries: ${profile.preferredIndustries.length > 0 ? profile.preferredIndustries.join(", ") : "Open to all"}
- Salary Expectation: ${profile.salaryExpectation ? `$${profile.salaryExpectation}/month` : "Not specified"}
- Family Size: ${profile.familySize}
- Has Passport: ${profile.hasPassport ? "Yes" : "No"}
- Work Experience Abroad: ${profile.hasWorkExperienceAbroad ? "Yes" : "No"}

AVAILABLE COUNTRIES DATA:
${JSON.stringify(countryData, null, 2)}

Provide your analysis in this exact JSON format:
{
  "topCountries": [
    {"country": "Country Name", "score": 85, "reason": "Brief reason why this country is a good match"}
  ],
  "topJobs": [
    {"title": "Job Title", "country": "Country", "salaryRange": "$X,XXX - $X,XXX/month", "reason": "Why this job fits their profile"}
  ],
  "actionItems": ["Specific action 1", "Specific action 2", "Specific action 3"],
  "strengthsAnalysis": "2-3 sentences about their strongest qualities for overseas employment",
  "improvementAreas": ["Area 1 to improve", "Area 2 to improve"]
}

IMPORTANT GUIDELINES:
- Recommend 3-5 top countries based on their profile match
- Recommend 5-8 specific job titles that match their skills
- Action items should be specific and actionable (e.g., "Get IELTS score of 7.0 or higher")
- Consider visa requirements, salary expectations, and family needs
- Be realistic about challenges based on their profile
- If they lack passport, make getting one the first action item`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert career advisor specializing in helping Kenyans find overseas employment. Always respond with valid JSON only, no additional text."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const recommendations = JSON.parse(content) as AIRecommendations;
    return recommendations;
  } catch (error) {
    console.error("AI analysis error:", error);
    // Return fallback recommendations
    return {
      topCountries: [
        { country: "Canada", score: 75, reason: "Strong demand for skilled workers with Express Entry program" },
        { country: "UAE", score: 70, reason: "Tax-free income and growing job market" },
        { country: "UK", score: 65, reason: "Healthcare and skilled worker visa programs available" }
      ],
      topJobs: [
        { title: profile.currentJobTitle || "General Worker", country: "Multiple", salaryRange: "$2,000 - $5,000/month", reason: "Based on your experience level" }
      ],
      actionItems: [
        profile.hasPassport ? "Ensure passport has 6+ months validity" : "Apply for a Kenyan passport immediately",
        "Take an English proficiency test (IELTS/TOEFL)",
        "Update your CV to international standards",
        "Research visa requirements for target countries"
      ],
      strengthsAnalysis: "Your profile shows potential for overseas employment. Focus on building relevant skills and certifications.",
      improvementAreas: ["Consider obtaining relevant certifications", "Improve language proficiency scores"]
    };
  }
}

export async function generateQuickMatch(
  skills: string[],
  experience: number,
  education: string
): Promise<{ countries: string[]; jobs: string[] }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a career advisor. Return only valid JSON."
        },
        {
          role: "user",
          content: `Quick match for Kenyan job seeker:
Skills: ${skills.join(", ")}
Experience: ${experience} years
Education: ${education}

Return JSON: {"countries": ["top 3 countries"], "jobs": ["top 5 job titles"]}`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response");
    
    return JSON.parse(content);
  } catch (error) {
    return {
      countries: ["Canada", "UAE", "UK"],
      jobs: ["General Worker", "Technician", "Support Staff"]
    };
  }
}
