export interface RatingBadge {
  level: "Platinum" | "Gold" | "Silver" | "Bronze";
  color: string;
  bgColor: string;
  score: number;
}

export interface RatingDisplay {
  showRating: boolean;
  badge: RatingBadge | null;
  message: string | null;
  daysUntilExpiry: number | null;
  warningLevel: "none" | "medium" | "high";
}

export function getRatingBadge(score: number): RatingBadge {
  if (score >= 90) return { level: "Platinum", color: "#4A7C59", bgColor: "#E8F5EE", score };
  if (score >= 75) return { level: "Gold", color: "#E6A700", bgColor: "#FFF8E1", score };
  if (score >= 60) return { level: "Silver", color: "#7A8A9A", bgColor: "#F0F4F8", score };
  return { level: "Bronze", color: "#8B6A5C", bgColor: "#F5EDE9", score };
}

export function getAgencyRatingDisplay(expiryDate: string, overallScore: number | null): RatingDisplay {
  if (overallScore === null) {
    return { showRating: false, badge: null, message: null, daysUntilExpiry: null, warningLevel: "none" };
  }

  const today = new Date();
  const expiry = new Date(expiryDate);
  const msUntilExpiry = expiry.getTime() - today.getTime();
  const daysUntilExpiry = Math.ceil(msUntilExpiry / (1000 * 60 * 60 * 24));
  const isExpired = msUntilExpiry < 0;
  const isExpiringSoon = !isExpired && msUntilExpiry < 30 * 24 * 60 * 60 * 1000;

  if (isExpired) {
    return {
      showRating: false,
      badge: null,
      message: "Rating hidden — License expired",
      daysUntilExpiry: null,
      warningLevel: "high",
    };
  }

  if (isExpiringSoon) {
    return {
      showRating: true,
      badge: getRatingBadge(overallScore),
      message: `Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"} — Verify renewal`,
      daysUntilExpiry,
      warningLevel: "medium",
    };
  }

  return {
    showRating: true,
    badge: getRatingBadge(overallScore),
    message: null,
    daysUntilExpiry,
    warningLevel: "none",
  };
}
