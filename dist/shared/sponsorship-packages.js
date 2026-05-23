"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_ADDON_TYPES = exports.INDIVIDUAL_ADDONS = exports.SPONSORSHIP_PACKAGES = void 0;
exports.getPackage = getPackage;
exports.getAddon = getAddon;
exports.getPackageEndDate = getPackageEndDate;
exports.formatPrice = formatPrice;
exports.isPackageActive = isPackageActive;
exports.getDaysRemaining = getDaysRemaining;
exports.SPONSORSHIP_PACKAGES = {
    basic_sponsored: {
        id: "basic_sponsored",
        name: "Basic Sponsored Listing",
        price: 10000,
        duration: 30,
        isPackage: true,
        features: [
            "Listed in sponsored section",
            "Agency name highlighted",
            "Basic visibility boost"
        ],
        includes: {
            sponsoredListing: true,
            topPlacement: false,
            verifiedBadge: false,
            homepageBanner: false,
            profilePage: false,
            clickAnalytics: false,
        }
    },
    featured_top: {
        id: "featured_top",
        name: "Featured Agency (Top)",
        price: 25000,
        duration: 30,
        isPackage: true,
        features: [
            "Top of search results",
            "Verified badge",
            "Priority placement",
            "Click analytics dashboard"
        ],
        includes: {
            sponsoredListing: true,
            topPlacement: true,
            verifiedBadge: true,
            homepageBanner: false,
            profilePage: false,
            clickAnalytics: true,
        }
    },
    premium_banner: {
        id: "premium_banner",
        name: "Premium + Banner",
        price: 50000,
        duration: 30,
        isPackage: true,
        features: [
            "Homepage banner ad",
            "Featured in all countries",
            "Verified badge",
            "Dedicated profile page",
            "Full analytics dashboard",
            "Priority support"
        ],
        includes: {
            sponsoredListing: true,
            topPlacement: true,
            verifiedBadge: true,
            homepageBanner: true,
            profilePage: true,
            clickAnalytics: true,
        }
    }
};
exports.INDIVIDUAL_ADDONS = {
    homepage_banner: {
        id: "homepage_banner",
        name: "Homepage Banner",
        price: 15000,
        duration: 30,
        isPackage: false,
        features: ["Prominent banner on homepage", "Maximum visibility"],
        includes: {
            sponsoredListing: false,
            topPlacement: false,
            verifiedBadge: false,
            homepageBanner: true,
            profilePage: false,
            clickAnalytics: false,
        }
    },
    country_exposure: {
        id: "country_exposure",
        name: "Country-Specific Exposure",
        price: 10000,
        duration: 30,
        isPackage: false,
        features: ["Featured in selected country page", "Targeted visibility"],
        includes: {
            sponsoredListing: false,
            topPlacement: false,
            verifiedBadge: false,
            homepageBanner: false,
            profilePage: false,
            clickAnalytics: false,
        }
    },
    verified_badge: {
        id: "verified_badge",
        name: "Verified Badge",
        price: 5000,
        duration: 30,
        isPackage: false,
        features: ["Visual verification badge", "Builds trust with job seekers"],
        includes: {
            sponsoredListing: false,
            topPlacement: false,
            verifiedBadge: true,
            homepageBanner: false,
            profilePage: false,
            clickAnalytics: false,
        }
    },
    profile_page: {
        id: "profile_page",
        name: "Agency Profile Page",
        price: 10000,
        duration: 30,
        isPackage: false,
        features: ["Dedicated agency profile", "Showcase services and details"],
        includes: {
            sponsoredListing: false,
            topPlacement: false,
            verifiedBadge: false,
            homepageBanner: false,
            profilePage: true,
            clickAnalytics: false,
        }
    },
    click_analytics: {
        id: "click_analytics",
        name: "Click Analytics Report",
        price: 5000,
        duration: 30,
        isPackage: false,
        features: ["Track clicks and views", "Performance insights"],
        includes: {
            sponsoredListing: false,
            topPlacement: false,
            verifiedBadge: false,
            homepageBanner: false,
            profilePage: false,
            clickAnalytics: true,
        }
    }
};
exports.ALL_ADDON_TYPES = {
    ...exports.SPONSORSHIP_PACKAGES,
    ...exports.INDIVIDUAL_ADDONS,
};
function getPackage(packageId) {
    return exports.SPONSORSHIP_PACKAGES[packageId];
}
function getAddon(addonId) {
    return exports.ALL_ADDON_TYPES[addonId];
}
function getPackageEndDate(startDate, packageId) {
    const pkg = getPackage(packageId);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (pkg?.duration || 30));
    return endDate;
}
function formatPrice(price) {
    return new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        minimumFractionDigits: 0,
    }).format(price);
}
function isPackageActive(endDate) {
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
    return end > new Date();
}
function getDaysRemaining(endDate) {
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
