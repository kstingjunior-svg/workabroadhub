import { describe, it, expect, vi } from "vitest";
vi.mock("../../server/db", () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
import { normalizeKePhone, displayKePhone, assessJobRisk } from "../../server/local-jobs-marketplace";
import { findPlace, locateJob, distanceKm } from "../../shared/kenya-places";

describe("local jobs — phone numbers", () => {
  it("normalises Kenyan mobile formats and rejects junk", () => {
    expect(normalizeKePhone("0712 345 678")).toBe("254712345678");
    expect(normalizeKePhone("+254 712-345-678")).toBe("254712345678");
    expect(normalizeKePhone("712345678")).toBe("254712345678");
    expect(normalizeKePhone("0110123456")).toBe("254110123456");
    expect(normalizeKePhone("020 123 4567")).toBeNull();
    expect(normalizeKePhone("12345")).toBeNull();
    expect(displayKePhone("254712345678")).toBe("0712 345 678");
  });
});

describe("local jobs — scam checks", () => {
  it("flags job-seeker fees and scam wording", () => {
    expect(assessJobRisk({ title: "Shop attendant", description: "Pay a registration fee of KES 500 before the interview. Work in Ruiru." })).toContain("asks_for_fee");
    expect(assessJobRisk({ title: "Driver", description: "Send money via mpesa first to secure the job, guaranteed job for all." })).toContain("asks_for_fee");
    expect(assessJobRisk({ title: "Typist", description: "Earn KES 3,000 per day from home, guaranteed job, no interview needed." })).toContain("scam_wording");
    expect(assessJobRisk({ title: "Cook", description: "We need an experienced cook for our restaurant in Kakamega town.", contactPhone: "0777777777" })).toContain("suspicious_phone");
  });
  it("does not flag a normal vacancy", () => {
    expect(assessJobRisk({ title: "Shop attendant", description: "Busy mini-supermarket in Kahawa Wendani needs a shop attendant. Monday to Saturday.", contactPhone: "0722418905" })).toEqual([]);
  });
});

describe("local jobs — places & near me", () => {
  it("finds estates, towns and counties", () => {
    expect(findPlace("Kahawa Wendani")?.county).toBe("Kiambu");
    expect(findPlace("ruiru town")?.name).toBe("Ruiru");
    expect(findPlace("Kakamega")?.county).toBe("Kakamega");
    expect(findPlace("nowhere-ville")).toBeNull();
  });
  it("Kahawa Wendani is near Ruiru, Kasarani and Thika but not Kakamega", () => {
    const kw = locateJob("Kahawa Wendani", null, "Kiambu")!;
    expect(distanceKm(kw, locateJob(null, "Ruiru", "Kiambu")!)).toBeLessThan(10);
    expect(distanceKm(kw, locateJob("Kasarani", null, "Nairobi")!)).toBeLessThan(10);
    expect(distanceKm(kw, locateJob(null, "Thika", "Kiambu")!)).toBeLessThan(30);
    expect(distanceKm(kw, locateJob(null, "Kakamega", "Kakamega")!)).toBeGreaterThan(200);
  });
  it("falls back to the county centre", () => {
    expect(locateJob(null, "Unknown Place", "Nakuru")).toEqual({ lat: -0.3031, lng: 36.08 });
  });
});

import { validatePublisherLocation, inKenya, normCounty } from "../../server/geo";
describe("geo — publisher location validation (no Google key → built-in places)", () => {
  it("accepts a pin near the picked place and fills county/town", async () => {
    const r = await validatePublisherLocation({ mode: "workplace", lat: -1.181, lng: 36.934, placeId: "kp:Kahawa Wendani" });
    expect(r.ok).toBe(true);
    expect(r.v.county).toBe("Kiambu");
  });
  it("rejects a pin far from the picked place", async () => {
    const r = await validatePublisherLocation({ mode: "workplace", lat: 0.2827, lng: 34.7519, placeId: "kp:Kahawa Wendani" });
    expect(r.ok).toBe(false);
  });
  it("rejects coordinates outside Kenya and accepts service areas", async () => {
    expect((await validatePublisherLocation({ lat: 51.5, lng: -0.12 })).ok).toBe(false);
    const s = await validatePublisherLocation({ mode: "service_area", lat: -1.2864, lng: 36.8172, serviceRadiusKm: 15, county: "Nairobi", town: "Nairobi" });
    expect(s.ok).toBe(true); expect(s.v.serviceRadiusKm).toBe(15);
  });
  it("helpers", () => {
    expect(inKenya(-1.18, 36.93)).toBe(true);
    expect(inKenya(-6, 36)).toBe(false);
    expect(normCounty("Nairobi County")).toBe("Nairobi");
    expect(normCounty("Murang'a County")).toBe("Murang'a");
  });
});
