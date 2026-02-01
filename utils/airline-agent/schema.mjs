
import { z } from "zod";

/**
 * Accepts:
 * - "yes", "Yes", "YES"
 * - "no",  "No",  "NO"
 * Always outputs lowercase.
 */
const YesNo = z.preprocess(
  (v) => {
    if (typeof v === "string") return v.trim().toLowerCase();
    return v;
  },
  z.enum(["yes", "no"])
);

/**
 * Accepts:
 * - ""
 * - "www.contourairlines.com"
 * - "https://contourairlines.com"
 * - "http://contourairlines.com"
 */
const UrlOrEmpty = z.preprocess(
  (v) => {
    if (typeof v !== "string") return "";
    return v.trim();
  },
  z.string()
);

export const AirlinePolicySchema = z
  .object({
    airlineCode: z.string().min(1),

    petPolicyURL: UrlOrEmpty.default(""),
    airlineURL: UrlOrEmpty.default(""),

    PetPolicySummary: z.string().default(""),
    ImprovedPetPolicySummary: z.string().default(""),

    microchip: YesNo.default("no"),
    healthCertificate: YesNo.default("no"),

    inCompartment: YesNo.default("no"),
    inCompartmentAnimals: z.array(z.string()).default([]),
    inCompartmentDetails: z.string().default(""),

    inCargo: YesNo.default("no"),
    inCargoAnimals: z.array(z.string()).default([]),
    inCargoDetails: z.string().default(""),

    carrierCompartmentDetails: z.string().default(""),
    carrierCargoDetails: z.string().default(""),

    dangerousBreeds: YesNo.default("no"),
    dangerousBreedList: z.string().default(""),

    brachycephalic: YesNo.default("no"),
    brachycephalicBreedList: z.string().default(""),

    serviceAnimals: YesNo.default("no"),
    serviceAnimalDetails: z.string().default(""),

    esAnimals: YesNo.default("no"),
    esaDetails: z.string().default(""),

    petShipping: YesNo.default("no"),

    healthVaccinations: z.array(z.string()).default([]),

    timestamp: z.string().optional(),
  })
  .strict();
