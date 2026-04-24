export const SERVICE_SLA = {
  "ATS CV Optimization": {
    hours: 12,
    display: "12 hours",
    description: "ATS keyword optimization and formatting",
  },
  "Country-Specific CV Rewrite": {
    hours: 24,
    display: "24 hours",
    description: "Professional CV rewrite tailored to your target country",
  },
  "CV Rewrite": {
    hours: 24,
    display: "24 hours",
    description: "Professional CV rewrite with ATS optimization",
  },
  "Cover Letter Writing": {
    hours: 12,
    display: "12 hours",
    description: "Tailored cover letter for your target role",
  },
  "Interview Coaching": {
    hours: 48,
    display: "48 hours",
    description: "Comprehensive interview preparation guide",
  },
  "Interview Preparation Pack": {
    hours: 24,
    display: "24 hours",
    description: "30 tailored Q&A + coaching guide for your target role",
  },
  "Visa Guidance Session": {
    hours: 48,
    display: "48 hours",
    description: "Detailed visa and immigration guidance",
  },
  "Visa Guidance": {
    hours: 48,
    display: "48 hours",
    description: "Detailed visa and immigration guidance",
  },
  "LinkedIn Profile Optimization": {
    hours: 24,
    display: "24 hours",
    description: "Complete LinkedIn profile optimization",
  },
  "LinkedIn Optimization": {
    hours: 24,
    display: "24 hours",
    description: "Complete LinkedIn profile optimization",
  },
  "Employment Contract Review": {
    hours: 48,
    display: "48 hours",
    description: "Full contract review with risk flags and advice",
  },
  "Employer Verification Report": {
    hours: 24,
    display: "24 hours",
    description: "Legitimacy check on your prospective overseas employer",
  },
  "Pre-Departure Orientation Pack": {
    hours: 24,
    display: "24 hours",
    description: "Country-specific guide: housing, banking, rights & culture",
  },
  "Application Tracker Setup": {
    hours: 4,
    display: "4 hours",
    description: "Personal tracker configured for your target countries and roles",
  },
  "Premium WhatsApp Support": {
    hours: 1,
    display: "Instant",
    description: "30 days priority WhatsApp support access",
  },
  "Premium Job Alerts": {
    hours: 1,
    display: "Instant",
    description: "Weekly curated verified job alerts via WhatsApp",
  },
  "Abroad Worker Emergency Support": {
    hours: 1,
    display: "Instant",
    description: "24/7 WhatsApp support for workers already overseas",
  },
} as const;

export type ServiceName = keyof typeof SERVICE_SLA;

export function getServiceSLA(serviceName: string): {
  hours: number;
  display: string;
  description: string;
} {
  const sla = SERVICE_SLA[serviceName as ServiceName];
  if (sla) return sla;
  return {
    hours: 24,
    display: "24 hours",
    description: "Professional career service",
  };
}

export function getExpectedDeliveryDate(serviceName: string, orderDate: Date): Date {
  const sla = getServiceSLA(serviceName);
  const deliveryDate = new Date(orderDate);
  deliveryDate.setHours(deliveryDate.getHours() + sla.hours);
  return deliveryDate;
}

export function formatDeliveryTime(deliveryDate: Date): string {
  const now = new Date();
  const diffMs = deliveryDate.getTime() - now.getTime();

  if (diffMs <= 0) return "Ready soon";

  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "Less than 1 hour";
  if (diffHours === 1) return "About 1 hour";
  if (diffHours < 24) return `About ${diffHours} hours`;
  const diffDays = Math.ceil(diffHours / 24);
  return diffDays === 1 ? "About 1 day" : `About ${diffDays} days`;
}
