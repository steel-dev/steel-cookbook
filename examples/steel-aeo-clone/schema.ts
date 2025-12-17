import { z } from "zod";

// Enum schemas
export const RankingTypeSchema = z.enum([
  "explicit_numbered",
  "explicit_ordered",
  "implicit_ordered",
  "unordered_list",
  "prose_only",
  "no_brands_mentioned",
]);

export const MentionContextSchema = z.enum([
  "primary_recommendation",
  "top_tier",
  "alternative_option",
  "conditional_recommendation",
  "comparison_mention",
  "negative_mention",
  "neutral_reference",
]);

export const RecommendationStrengthSchema = z.enum([
  "highly_recommended",
  "recommended",
  "suggested",
  "mentioned",
  "cautioned",
]);

export const ResponseConfidenceSchema = z.enum(["high", "medium", "low"]);

// Brand mention schema
export const BrandMentionSchema = z.object({
  brand: z.string(),
  position: z.number().int().optional(),
  mention_count: z.number().int().positive(),
  relevance_score: z.number().min(0).max(1),
  context: MentionContextSchema,
  recommendation_strength: RecommendationStrengthSchema,
  first_mention_position: z.number().int().positive(),
  has_elaboration: z.boolean(),
  elaboration_length: z.number().int().positive().optional(),
});

// Explicit ranking item schema
export const ExplicitRankingItemSchema = z.object({
  brand: z.string(),
  position: z.number().int().min(1).max(5),
});

// Main analyzer response schema
export const AnalyzerResponseSchema = z.object({
  ranking_type: RankingTypeSchema,
  has_explicit_top_5: z.boolean(),
  explicit_ranking: z.array(ExplicitRankingItemSchema).nullable(),
  all_brand_mentions: z.array(BrandMentionSchema),
  total_brands_mentioned: z.number().int().nonnegative(),
  response_confidence: ResponseConfidenceSchema,
  notes: z.string().optional(),
});

// Infer TypeScript types from Zod schemas
export type RankingType = z.infer<typeof RankingTypeSchema>;
export type MentionContext = z.infer<typeof MentionContextSchema>;
export type RecommendationStrength = z.infer<
  typeof RecommendationStrengthSchema
>;
export type ResponseConfidence = z.infer<typeof ResponseConfidenceSchema>;
export type BrandMention = z.infer<typeof BrandMentionSchema>;
export type ExplicitRankingItem = z.infer<typeof ExplicitRankingItemSchema>;
export type AnalyzerResponse = z.infer<typeof AnalyzerResponseSchema>;
