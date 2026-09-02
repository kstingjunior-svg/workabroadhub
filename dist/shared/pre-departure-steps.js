"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Pre-departure checklist — activates when a user marks their journey stage
// as "hired". 8 universal items + country-specific additions.
//
// Step keys use the `pd_` prefix to namespace them away from the broader
// journey checklist (passport, kcse_attestation, etc.) in the same
// completedSteps JSONB array.
//
// 2026-06 retention #7.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTRY_SPECIFIC_PRE_DEPARTURE = exports.UNIVERSAL_PRE_DEPARTURE = void 0;
exports.getPreDepartureSteps = getPreDepartureSteps;
// Apply to every destination
exports.UNIVERSAL_PRE_DEPARTURE = [
    {
        key: "pd_confirm_flight",
        title: "Confirm flight + arrival timezone",
        description: "Confirm departure date, arrival time, and what day-of-week you land. Take a screenshot of the booking — phones die mid-travel.",
        category: "logistics",
        daysBefore: 14,
    },
    {
        key: "pd_documents_bundle",
        title: "Build your documents bundle",
        description: "Originals + photocopies of: passport, visa printout, work contract, attested KCSE & college certificates, medical certs, vaccination card, marriage/birth certs if relevant. Pack copies separately from originals.",
        category: "documents",
        daysBefore: 10,
    },
    {
        key: "pd_carry_on",
        title: "Pack carry-on essentials",
        description: "Passport + visa printout, prescription medication for 90 days, phone + charger + adapter, one change of clothes, KES 5,000 cash, snacks. Assume your checked luggage gets lost.",
        category: "logistics",
        daysBefore: 5,
    },
    {
        key: "pd_money_setup",
        title: "Set up how you'll send money home",
        description: "Open M-Pesa Global, Wise, WorldRemit, or Remitly account before you fly — verification takes days and is harder once you're abroad. Confirm with employer when your first paycheck lands.",
        category: "money",
        daysBefore: 14,
    },
    {
        key: "pd_safaricom_bank",
        title: "Notify Safaricom + your bank",
        description: "Activate Safaricom international roaming (or arrange a local SIM on arrival). Tell your bank you'll be travelling so card transactions don't get auto-blocked as fraud.",
        category: "money",
        daysBefore: 7,
    },
    {
        key: "pd_family_contacts",
        title: "Brief your family",
        description: "Share: your employer's name + address, your sponsor's phone, the Kenyan embassy phone in your destination country, your flight number + arrival time. Pick ONE primary contact at home who knows everything.",
        category: "family",
        daysBefore: 7,
    },
    {
        key: "pd_arrival_plan",
        title: "Lock down your first 48 hours abroad",
        description: "Confirm in writing: airport pickup name + phone, accommodation address (print it), first-day work check-in time. Save offline maps of the area on Google Maps.",
        category: "arrival",
        daysBefore: 5,
    },
    {
        key: "pd_embassy_register",
        title: "Plan to register with the Kenyan embassy on arrival",
        description: "Within your first week, register with the Kenyan embassy in your destination. They use this list to reach you in emergencies (war, evacuation, family death). Free, takes 10 min online or in person.",
        category: "arrival",
        daysBefore: 0, // do on arrival
    },
];
// Country-specific additions layered on top of the universals
exports.COUNTRY_SPECIFIC_PRE_DEPARTURE = {
    // ── Gulf states share most concerns ──────────────────────────────────────
    AE: [
        {
            key: "pd_sponsor_details",
            title: "Memorize your sponsor's details",
            description: "Police and immigration may stop you in the first weeks. Memorize (don't just save) sponsor's full name, your workplace address, and your contract number. Carry a printed contract.",
            category: "documents",
            daysBefore: 3,
            countrySpecific: true,
        },
        {
            key: "pd_contract_translation",
            title: "Confirm your contract is bilingual (Arabic + English)",
            description: "UAE labor law requires a bilingual employment contract. If yours isn't, push back BEFORE you fly — it's harder to dispute on arrival.",
            category: "documents",
            daysBefore: 14,
            countrySpecific: true,
        },
    ],
    SA: [
        {
            key: "pd_sponsor_details",
            title: "Memorize your sponsor (kafeel) details",
            description: "Saudi sponsorship is everything. Memorize sponsor's full name, iqama number, and workplace address. Carry a printed contract — domestic worker contracts MUST be bilingual.",
            category: "documents",
            daysBefore: 3,
            countrySpecific: true,
        },
        {
            key: "pd_dress_code",
            title: "Pack appropriate clothing",
            description: "Modest dress is enforced for women in many areas. Pack a long-sleeved abaya for arrival even if you'll wear other clothing at work or at home.",
            category: "logistics",
            daysBefore: 5,
            countrySpecific: true,
        },
    ],
    QA: [
        {
            key: "pd_qid_plan",
            title: "Plan for QID + medical within 30 days",
            description: "You have 30 days from landing to complete fingerprinting + medical for your Qatar ID. Without QID you can't open a bank account or rent. Employer usually arranges — confirm the timeline before flying.",
            category: "documents",
            daysBefore: 14,
            countrySpecific: true,
        },
    ],
    BH: [
        {
            key: "pd_cpr_plan",
            title: "Plan your CPR (Central Population Registry) appointment",
            description: "You need a CPR card to do anything official in Bahrain. Employer usually arranges within the first 2 weeks. Confirm timeline before flying.",
            category: "documents",
            daysBefore: 14,
            countrySpecific: true,
        },
    ],
    // ── Western destinations ─────────────────────────────────────────────────
    GB: [
        {
            key: "pd_brp_collection",
            title: "Print your BRP collection details",
            description: "Your Biometric Residence Permit (BRP) is issued in the UK — you'll need to collect it within 10 days of arrival from a specific Post Office. Print the collection letter; don't rely on email.",
            category: "documents",
            daysBefore: 7,
            countrySpecific: true,
        },
        {
            key: "pd_nhs_surcharge",
            title: "Save NHS surcharge payment proof",
            description: "You paid the Immigration Health Surcharge with your visa. Save the IHS reference number — you'll need it to register with a GP and to prove eligibility for free NHS care.",
            category: "documents",
            daysBefore: 7,
            countrySpecific: true,
        },
        {
            key: "pd_tb_cert",
            title: "Pack your TB screening certificate",
            description: "Required for Kenyans entering the UK. Carry the IOM-issued certificate with you in carry-on — border officers can ask for it.",
            category: "documents",
            daysBefore: 5,
            countrySpecific: true,
        },
    ],
    CA: [
        {
            key: "pd_copr",
            title: "Pack your COPR + ECA",
            description: "Confirmation of Permanent Residence (COPR) is your most important document on arrival — without it you can't enter as a PR. Pack your Educational Credential Assessment (ECA) result too for tax + provincial registration.",
            category: "documents",
            daysBefore: 7,
            countrySpecific: true,
        },
        {
            key: "pd_first_two_weeks",
            title: "Print a Canadian address for your first 2 weeks",
            description: "CBSA wants to know where you're staying. Have a printed booking (hotel, Airbnb, friend's address) — saying \"I don't know yet\" can delay entry.",
            category: "arrival",
            daysBefore: 3,
            countrySpecific: true,
        },
    ],
    AU: [
        {
            key: "pd_visa_grant_letter",
            title: "Print your visa grant letter",
            description: "Australian visas are electronic (linked to your passport) but ALWAYS carry a printed grant notice. Border officers and employers may want a hard copy.",
            category: "documents",
            daysBefore: 5,
            countrySpecific: true,
        },
        {
            key: "pd_quarantine_food",
            title: "Empty your luggage of food and seeds",
            description: "Australia's biosecurity rules are strict. Throw out any plant matter, meat, dairy, or seeds (even unopened) before packing. Declare anything questionable — penalties for missing items are severe.",
            category: "logistics",
            daysBefore: 1,
            countrySpecific: true,
        },
    ],
    DE: [
        {
            key: "pd_anmeldung_appointment",
            title: "Book your Anmeldung appointment online",
            description: "You have 14 days from arrival to register your address with the Bürgeramt. Slots fill weeks ahead in Berlin and Munich — book BEFORE you fly.",
            category: "arrival",
            daysBefore: 21,
            countrySpecific: true,
        },
        {
            key: "pd_krankenkasse",
            title: "Pre-pick a Krankenkasse (health insurance fund)",
            description: "Statutory insurance is required from day 1. TK and AOK are the most expat-friendly. You can sign up online before arriving — they'll send the membership card to your German address.",
            category: "money",
            daysBefore: 14,
            countrySpecific: true,
        },
    ],
    US: [
        {
            key: "pd_i797",
            title: "Pack your I-797 + employer letter",
            description: "CBP at the airport will ask to see your I-797 approval notice and an offer letter from your employer. Print both — don't rely on email on a dying phone.",
            category: "documents",
            daysBefore: 5,
            countrySpecific: true,
        },
        {
            key: "pd_ssn_plan",
            title: "Plan to apply for a Social Security Number",
            description: "Apply for an SSN within 2 weeks of arrival — without it you can't be paid, rent, or get a phone plan. Find the nearest SSA office in advance.",
            category: "arrival",
            daysBefore: 7,
            countrySpecific: true,
        },
    ],
};
/**
 * Get the full ordered pre-departure step list for a given country code.
 * Sorted by daysBefore descending so the most-time-sensitive item is at the top.
 */
function getPreDepartureSteps(countryCode) {
    const code = (countryCode || "").toUpperCase();
    const specific = exports.COUNTRY_SPECIFIC_PRE_DEPARTURE[code] ?? [];
    const all = [...exports.UNIVERSAL_PRE_DEPARTURE, ...specific];
    return all.sort((a, b) => (b.daysBefore ?? 0) - (a.daysBefore ?? 0));
}
