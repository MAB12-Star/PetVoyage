import { z } from "zod";

export const LinkSchema = z.object({
  name: z.string().min(1),
  url: z.string().url()
});

export const MapEntrySchema = z.object({
  description: z.string().default("<p>Not specified.</p>"),
  requirements: z.array(z.string()).default([])
});

export const PetRegulationDetailSchema = z.object({
  vaccinations: z.object({}).catchall(MapEntrySchema).default({}),
  certifications: z.object({}).catchall(MapEntrySchema).default({}),
  microchip: z.string().default("<p>Not specified.</p>"),
  moreInfo: z.object({}).catchall(MapEntrySchema).default({}),
  links: z.array(LinkSchema).default([])
});

export const OriginRequirementSchema = z.object({
  appliesTo: z.array(z.string()).default([]),
  details: z.string()
});

export const CountryPetRegulationSchema = z.object({
  destinationCountry: z.string().min(1),

  // Map<String, PetRegulationDetail>
  regulationsByPetType: z.object({}).catchall(PetRegulationDetailSchema).default({}),

  // Map<String, OriginRequirement>
  originRequirements: z.object({}).catchall(OriginRequirementSchema).default({}),

  officialLinks: z.array(LinkSchema).default([]),

  // Your agent outputs ISO strings; Mongo stores Date. This is fine at ingest time.
  sourceLastModified: z.string().nullable().default(null),
  sourceLastModifiedNote: z.string().default(""),
  source_id: z.any().nullable().default(null),

  timestamp: z.string()
});
