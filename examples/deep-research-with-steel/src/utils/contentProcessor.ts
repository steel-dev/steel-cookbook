/**
 * Content processing utilities for the Deep Research Agent
 * Provides basic text truncation, cleaning, and summarization helpers
 */

export interface TruncationOptions {
  maxLength: number;
  preserveWords?: boolean;
  suffix?: string;
  encoding?: "utf8" | "tokens";
}

export interface ContentMetrics {
  characterCount: number;
  wordCount: number;
  paragraphCount: number;
  estimatedTokens: number;
}

// Default truncation options
const DEFAULT_TRUNCATION_OPTIONS: Required<TruncationOptions> = {
  maxLength: 4000,
  preserveWords: true,
  suffix: "...",
  encoding: "utf8",
};

/**
 * Truncates text content to specified length
 * @param content - The content to truncate
 * @param options - Truncation options
 * @returns Truncated content
 */
export function truncateContent(
  content: string,
  options: Partial<TruncationOptions> = {}
): string {
  const opts = { ...DEFAULT_TRUNCATION_OPTIONS, ...options };

  if (!content || content.length <= opts.maxLength) {
    return content;
  }

  let truncated = content.substring(0, opts.maxLength);

  if (opts.preserveWords) {
    // Find the last complete word boundary
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > 0) {
      truncated = truncated.substring(0, lastSpace);
    }
  }

  return truncated + opts.suffix;
}

/**
 * Estimates token count for content (rough approximation)
 * @param content - The content to count tokens for
 * @returns Estimated token count
 */
export function estimateTokenCount(content: string): number {
  // Rough estimation: 1 token ≈ 4 characters for English text
  return Math.ceil(content.length / 4);
}

/**
 * Gets content metrics for analysis
 * @param content - The content to analyze
 * @returns Content metrics
 */
export function getContentMetrics(content: string): ContentMetrics {
  const characterCount = content.length;
  const wordCount = content.trim().split(/\s+/).length;
  const paragraphCount = content.split(/\n\s*\n/).length;
  const estimatedTokens = estimateTokenCount(content);

  return {
    characterCount,
    wordCount,
    paragraphCount,
    estimatedTokens,
  };
}

/**
 * Cleans and normalizes text content
 * @param content - The content to clean
 * @returns Cleaned content
 */
export function cleanContent(content: string): string {
  return (
    content
      // Remove excessive whitespace
      .replace(/\s+/g, " ")
      // Remove multiple consecutive newlines
      .replace(/\n{3,}/g, "\n\n")
      // Remove leading/trailing whitespace
      .trim()
  );
}

/**
 * Extracts key phrases from content (simple implementation)
 * @param content - The content to extract phrases from
 * @param maxPhrases - Maximum number of phrases to extract
 * @returns Array of key phrases
 */
export function extractKeyPhrases(
  content: string,
  maxPhrases: number = 10
): string[] {
  // Simple extraction based on frequency and length
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const phrases: string[] = [];

  for (const sentence of sentences) {
    const cleaned = sentence.trim();
    if (cleaned.length > 20 && cleaned.length < 100) {
      phrases.push(cleaned);
    }
  }

  return phrases.sort((a, b) => b.length - a.length).slice(0, maxPhrases);
}

/**
 * Checks if content appears to be meaningful (not just noise)
 * @param content - The content to check
 * @returns True if content seems meaningful
 */
export function isContentMeaningful(content: string): boolean {
  if (!content || content.length < 50) {
    return false;
  }

  // Check for minimum word count
  const wordCount = content.trim().split(/\s+/).length;
  if (wordCount < 10) {
    return false;
  }

  // Check for excessive repetition
  const uniqueWords = new Set(content.toLowerCase().split(/\s+/));
  const repetitionRatio = uniqueWords.size / wordCount;
  if (repetitionRatio < 0.3) {
    return false;
  }

  // Check for reasonable sentence structure
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length < 2) {
    return false;
  }

  return true;
}

/**
 * Sanitizes content for safe processing
 * @param content - The content to sanitize
 * @returns Sanitized content
 */
export function sanitizeContent(content: string): string {
  return (
    content
      // Remove HTML tags (basic)
      .replace(/<[^>]*>/g, "")
      // Remove excessive special characters
      .replace(/[^\w\s\-.,!?;:()]/g, "")
      // Clean up whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Splits content into manageable chunks
 * @param content - The content to split
 * @param maxChunkSize - Maximum size of each chunk
 * @param overlapSize - Size of overlap between chunks
 * @returns Array of content chunks
 */
export function splitIntoChunks(
  content: string,
  maxChunkSize: number = 3000,
  overlapSize: number = 200
): string[] {
  if (content.length <= maxChunkSize) {
    return [content];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    let end = start + maxChunkSize;

    // If not at the end, try to find a good break point
    if (end < content.length) {
      const lastPeriod = content.lastIndexOf(".", end);
      const lastSpace = content.lastIndexOf(" ", end);

      if (lastPeriod > start + maxChunkSize / 2) {
        end = lastPeriod + 1;
      } else if (lastSpace > start + maxChunkSize / 2) {
        end = lastSpace;
      }
    }

    chunks.push(content.substring(start, end).trim());
    start = Math.max(start + 1, end - overlapSize);
  }

  return chunks;
}

/**
 * Combines multiple content pieces with appropriate separators
 * @param contents - Array of content pieces
 * @param separator - Separator to use between pieces
 * @returns Combined content
 */
export function combineContent(
  contents: string[],
  separator: string = "\n\n"
): string {
  return contents
    .filter((content) => content && content.trim().length > 0)
    .map((content) => content.trim())
    .join(separator);
}

/**
 * Extracts title from content (first meaningful line)
 * @param content - The content to extract title from
 * @returns Extracted title or null
 */
export function extractTitle(content: string): string | null {
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 10 && trimmed.length < 100) {
      // Remove common title prefixes
      const cleaned = trimmed
        .replace(/^(title:|heading:|h1:|#\s*)/i, "")
        .trim();
      if (cleaned.length > 5) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Validates content quality for research purposes
 * @param content - The content to validate
 * @returns Validation result with score and issues
 */
export function validateContentQuality(content: string): {
  score: number;
  issues: string[];
  isValid: boolean;
} {
  const issues: string[] = [];
  let score = 100;

  // Check minimum length
  if (content.length < 100) {
    issues.push("Content too short");
    score -= 30;
  }

  // Check for meaningful content
  if (!isContentMeaningful(content)) {
    issues.push("Content lacks meaning");
    score -= 40;
  }

  // Check for excessive repetition
  const words = content.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  const repetitionRatio = uniqueWords.size / words.length;
  if (repetitionRatio < 0.4) {
    issues.push("Too much repetition");
    score -= 20;
  }

  // Check for reasonable structure
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length < 3) {
    issues.push("Poor sentence structure");
    score -= 15;
  }

  return {
    score: Math.max(0, score),
    issues,
    isValid: score >= 60,
  };
}

// Export utility functions for easy testing
export const contentUtils = {
  truncateContent,
  estimateTokenCount,
  getContentMetrics,
  cleanContent,
  extractKeyPhrases,
  isContentMeaningful,
  sanitizeContent,
  splitIntoChunks,
  combineContent,
  extractTitle,
  validateContentQuality,
};
