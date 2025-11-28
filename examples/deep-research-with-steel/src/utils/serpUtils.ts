/**
 * SERP Utilities - Search Engine Results Page Processing
 *
 * This module provides utilities for processing search engine results pages,
 * extracting URLs, and filtering/validating search results. It's designed to
 * be used by the SearchAgent but kept separate for better maintainability.
 *
 * KEY FEATURES:
 * - Multiple URL extraction strategies (markdown, href, plain URLs)
 * - URL filtering and validation
 * - Domain blacklisting for irrelevant sources
 * - Duplicate URL detection
 * - Configurable result limits
 *
 * USAGE:
 * ```typescript
 * import { extractSearchUrls, filterUrls, validateUrl } from './serpUtils';
 *
 * const urls = extractSearchUrls(serpResponse, 5);
 * const filtered = filterUrls(urls, { excludeYouTube: true });
 * ```
 */

import { logger } from "./logger";

/**
 * Configuration options for URL extraction
 */
export interface URLExtractionOptions {
  maxResults?: number;
  excludeYouTube?: boolean;
  excludeGoogleServices?: boolean;
  excludeDomains?: string[];
  includeDomains?: string[];
}

/**
 * Extract URLs from Google search results using multiple strategies
 *
 * This function implements a comprehensive approach to extracting URLs from
 * search results, trying multiple methods to ensure maximum success rate.
 */
export function extractSearchUrls(
  serpResponse: any,
  maxResults: number = 5,
  options: URLExtractionOptions = {}
): string[] {
  // Handle different Steel API response formats
  const content =
    typeof serpResponse.content === "string"
      ? serpResponse.content
      : typeof serpResponse.markdown === "string"
      ? serpResponse.markdown
      : JSON.stringify(serpResponse);

  const urls: string[] = [];

  logger.debug("🔍 SERP Response sample:", content.substring(0, 500));

  // Method 1: Markdown links - most reliable for Steel's markdown format
  extractMarkdownLinks(content, urls, maxResults, options);

  // Method 2: Look for URLs in href attributes if structured data
  if (urls.length < maxResults) {
    extractHrefUrls(content, urls, maxResults, options);
  }

  // Method 3: Look for plain HTTP URLs as fallback
  if (urls.length < maxResults) {
    extractPlainUrls(content, urls, maxResults, options);
  }

  logger.debug(`📊 Total URLs found: ${urls.length}`);

  return urls.slice(0, maxResults);
}

/**
 * Extract URLs from markdown link format: [text](url)
 */
function extractMarkdownLinks(
  content: string,
  urls: string[],
  maxResults: number,
  options: URLExtractionOptions
): void {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while (
    (match = linkRegex.exec(content)) !== null &&
    urls.length < maxResults
  ) {
    const url = match[2];

    if (url && validateUrl(url, options) && !urls.includes(url)) {
      urls.push(url);
      logger.debug(`📄 Found markdown URL: ${url}`);
    }
  }
}

/**
 * Extract URLs from href attributes in HTML/structured content
 */
function extractHrefUrls(
  content: string,
  urls: string[],
  maxResults: number,
  options: URLExtractionOptions
): void {
  const hrefRegex = /href="([^"]+)"/g;
  let match;

  while (
    (match = hrefRegex.exec(content)) !== null &&
    urls.length < maxResults
  ) {
    const url = match[1];

    if (url && validateUrl(url, options) && !urls.includes(url)) {
      urls.push(url);
      logger.debug(`🔗 Found href URL: ${url}`);
    }
  }
}

/**
 * Extract plain HTTP URLs from text content
 */
function extractPlainUrls(
  content: string,
  urls: string[],
  maxResults: number,
  options: URLExtractionOptions
): void {
  const urlRegex = /https?:\/\/[^\s<>"]+/g;
  let match;

  while (
    (match = urlRegex.exec(content)) !== null &&
    urls.length < maxResults
  ) {
    const url = match[0];

    if (url && validateUrl(url, options) && !urls.includes(url)) {
      urls.push(url);
      logger.debug(`🌐 Found plain URL: ${url}`);
    }
  }
}

/**
 * Validate and filter URLs based on configuration
 */
export function validateUrl(
  url: string,
  options: URLExtractionOptions = {}
): boolean {
  if (!url || !url.startsWith("http")) {
    return false;
  }

  // Default exclusions for irrelevant sources
  const defaultExclusions = [
    "google.com",
    "googleadservices.com",
    "googlesyndication.com",
    "googleusercontent.com",
    "webcache.googleusercontent.com",
  ];

  // Optional exclusions
  const optionalExclusions = [];
  if (options.excludeYouTube) {
    optionalExclusions.push("youtube.com", "youtu.be");
  }
  if (options.excludeGoogleServices) {
    optionalExclusions.push("maps.google.com", "images.google.com");
  }

  // Combine all exclusions
  const allExclusions = [
    ...defaultExclusions,
    ...optionalExclusions,
    ...(options.excludeDomains || []),
  ];

  // Check if URL contains any excluded domains
  if (allExclusions.some((domain) => url.includes(domain))) {
    return false;
  }

  // Check if URL contains search parameters (usually not content)
  if (url.includes("/search?")) {
    return false;
  }

  // If includeDomains is specified, only allow those domains
  if (options.includeDomains && options.includeDomains.length > 0) {
    return options.includeDomains.some((domain) => url.includes(domain));
  }

  return true;
}

/**
 * Filter and deduplicate URLs
 */
export function filterUrls(
  urls: string[],
  options: URLExtractionOptions = {}
): string[] {
  const filtered = urls.filter((url) => validateUrl(url, options));

  // Remove duplicates while preserving order
  const seen = new Set<string>();
  return filtered.filter((url) => {
    if (seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });
}

/**
 * Extract domain from URL for categorization
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    logger.warn(`Failed to extract domain from URL: ${url}`);
    return "unknown";
  }
}

/**
 * Group URLs by domain for analysis
 */
export function groupUrlsByDomain(urls: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};

  urls.forEach((url) => {
    const domain = extractDomain(url);
    if (!grouped[domain]) {
      grouped[domain] = [];
    }
    grouped[domain].push(url);
  });

  return grouped;
}

/**
 * Calculate diversity score for URL list (higher is more diverse)
 */
export function calculateUrlDiversity(urls: string[]): number {
  if (urls.length === 0) return 0;

  const domains = urls.map((url) => extractDomain(url));
  const uniqueDomains = new Set(domains);

  return uniqueDomains.size / urls.length;
}

/**
 * Sort URLs by domain diversity (prefer variety)
 */
export function sortByDiversity(urls: string[]): string[] {
  const domainCount: Record<string, number> = {};

  // Count occurrences of each domain
  urls.forEach((url) => {
    const domain = extractDomain(url);
    domainCount[domain] = (domainCount[domain] || 0) + 1;
  });

  // Sort by domain frequency (less frequent domains first)
  return [...urls].sort((a, b) => {
    const domainA = extractDomain(a);
    const domainB = extractDomain(b);
    const countA = domainCount[domainA] || 0;
    const countB = domainCount[domainB] || 0;
    return countA - countB;
  });
}
