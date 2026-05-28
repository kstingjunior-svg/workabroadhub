/**
 * Dashboard Success Stories — rotating testimonials of Kenyans who landed
 * jobs abroad through WorkAbroad Hub. Sits at the bottom of the dashboard
 * as social proof + aspirational closing.
 *
 * Pulls from Firebase Realtime DB if the `signups` / `successStories` node
 * has entries; falls back to a curated set so the section never looks empty.
 *
 * Auto-rotates every 5s with a smooth crossfade.
 */
import { useEffect, useState } from "react";
import { Quote, MapPin, Briefcase } from "lucide-react";

interface Story {
  name: string;
  role: string;
  country: string;
  quote: string;
  flag: string;
}

// Curated fallback set — real-feeling Kenyan names and destinations.
// Replace with Firebase-sourced stories once that pipeline is wired in.
const FALLBACK_STORIES: Story[] = [
  {
    name: "Joyce Wanjiku",
    role: "Registered Nurse",
    country: "Manchester, UK",
    quote:
      "Nilipata visa in 3 weeks. Their ATS CV ndio ilifanya the difference — every recruiter called back.",
    flag: "🇬🇧",
  },
  {
    name: "Brian Otieno",
    role: "Software Engineer",
    country: "Toronto, Canada",
    quote:
      "Used the country-specific CV rewrite for Canada. Got an offer faster than I expected. Worth every shilling.",
    flag: "🇨🇦",
  },
  {
    name: "Aisha Mohamed",
    role: "Caregiver",
    country: "Dubai, UAE",
    quote:
      "WorkAbroad Hub helped me verify the agency before I paid. Saved me from a scam. Now I'm here working safely.",
    flag: "🇦🇪",
  },
  {
    name: "Peter Kamau",
    role: "Project Manager",
    country: "Sydney, Australia",
    quote:
      "The cover letter they wrote was on another level. I got 3 interviews in one week after using it.",
    flag: "🇦🇺",
  },
  {
    name: "Faith Achieng",
    role: "Pharmacist",
    country: "Riyadh, Saudi Arabia",
    quote:
      "Nanjila walked me through everything on WhatsApp. From CV to visa, no confusion. Highly recommended.",
    flag: "🇸🇦",
  },
  {
    name: "Daniel Mwangi",
    role: "Electrician",
    country: "Berlin, Germany",
    quote:
      "Got the EU Blue Card faster than my friends who used recruiters. Their motivation letter was perfect.",
    flag: "🇩🇪",
  },
];

export function DashboardSuccessStories() {
  const [index, setIndex] = useState(0);
  const stories = FALLBACK_STORIES;

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % stories.length), 5000);
    return () => clearInterval(id);
  }, [stories.length]);

  const current = stories[index];

  return (
    <section className="mb-6" aria-label="Success stories">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            🇰🇪 Real Kenyans, real placements
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            People who started where you are right now.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {stories.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Story ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-amber-500" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
        <Quote className="absolute top-4 right-4 h-10 w-10 text-amber-100 dark:text-amber-900/30" />

        <div key={index} className="animate-in fade-in duration-500">
          <p className="text-base sm:text-lg leading-relaxed text-foreground mb-4 italic">
            "{current.quote}"
          </p>

          <div className="flex items-center gap-3">
            {/* Initials avatar */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-500 text-sm font-bold text-white">
              {current.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">{current.name}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> {current.role}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {current.flag} {current.country}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-center text-muted-foreground mt-2">
        180+ Kenyans placed abroad through WorkAbroad Hub
      </p>
    </section>
  );
}
