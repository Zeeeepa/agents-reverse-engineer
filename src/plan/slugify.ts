/**
 * Task description to branch-safe slug conversion.
 *
 * Converts a free-form task description into a lowercase, hyphen-separated
 * string safe for use in git branch names.
 *
 * @module
 */

/**
 * Convert a task description to a branch-safe slug.
 *
 * Rules:
 * - Lowercase
 * - Replace non-alphanumeric characters with hyphens
 * - Collapse consecutive hyphens
 * - Trim leading/trailing hyphens
 * - Truncate to 60 characters (to keep branch names reasonable)
 *
 * @param taskDescription - Free-form task description
 * @returns Branch-safe slug string
 *
 * @example
 * ```typescript
 * slugify("Add rate limiting to the API endpoints")
 * // → "add-rate-limiting-to-the-api-endpoints"
 *
 * slugify("Fix bug #123: user can't login")
 * // → "fix-bug-123-user-can-t-login"
 * ```
 */
export function slugify(taskDescription: string): string {
  return taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, ''); // trim trailing hyphen after truncation
}
