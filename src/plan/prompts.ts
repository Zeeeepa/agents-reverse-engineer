/**
 * Prompt templates for the `are plan` command.
 *
 * Contains the planning prompt (identical for both environments) and
 * the evaluator prompt used for `--eval` mode.
 *
 * @module
 */

/**
 * Build the planning prompt sent to the AI in each worktree.
 *
 * Both runs (with-docs and without-docs) receive the identical prompt;
 * only the environment (available files) differs.
 *
 * @param task - The user's task description
 * @returns The planning prompt string
 */
export function buildPlanningPrompt(task: string): string {
  return `You are a software architect. Create a detailed implementation plan for the following task:

<task>${task}</task>

Explore the codebase thoroughly. Your plan should include:
1. Files to create or modify (with full paths)
2. Specific functions/classes to change
3. Step-by-step implementation instructions
4. Dependencies or imports needed
5. Edge cases and risks
6. Testing strategy

Use your tools to read files and understand the codebase before planning.
Output your plan in markdown format.`;
}

/**
 * Build the evaluator prompt for `--eval` mode.
 *
 * Plans are presented in randomized order as "Plan A" / "Plan B" to
 * prevent position bias. The evaluator does NOT receive ARE docs --
 * it judges on engineering merit alone.
 *
 * @param task - The original task description
 * @param planA - First plan text
 * @param planB - Second plan text
 * @returns The evaluator prompt string
 */
export function buildEvaluatorPrompt(
  task: string,
  planA: string,
  planB: string,
): string {
  return `You are an expert software engineering evaluator. You are comparing two implementation plans for the same task.

<task>${task}</task>

<plan_a>
${planA}
</plan_a>

<plan_b>
${planB}
</plan_b>

Evaluate each plan on the following criteria using a 1-5 scale:

1. **Specificity** (25% weight): Does the plan reference specific files, functions, and code paths? Are file paths complete and accurate?
2. **Accuracy** (25% weight): Are the technical details correct? Does the plan demonstrate understanding of the codebase?
3. **Completeness** (20% weight): Does the plan cover all aspects of the task? Are edge cases addressed?
4. **Actionability** (20% weight): Could a developer follow this plan step-by-step without ambiguity?
5. **Risk Awareness** (10% weight): Does the plan identify potential risks, breaking changes, or dependencies?

Respond with ONLY valid JSON in the following format (no markdown fences, no extra text):

{
  "specificity": {
    "planA": { "score": <1-5>, "reasoning": "<brief explanation>" },
    "planB": { "score": <1-5>, "reasoning": "<brief explanation>" }
  },
  "accuracy": {
    "planA": { "score": <1-5>, "reasoning": "<brief explanation>" },
    "planB": { "score": <1-5>, "reasoning": "<brief explanation>" }
  },
  "completeness": {
    "planA": { "score": <1-5>, "reasoning": "<brief explanation>" },
    "planB": { "score": <1-5>, "reasoning": "<brief explanation>" }
  },
  "actionability": {
    "planA": { "score": <1-5>, "reasoning": "<brief explanation>" },
    "planB": { "score": <1-5>, "reasoning": "<brief explanation>" }
  },
  "riskAwareness": {
    "planA": { "score": <1-5>, "reasoning": "<brief explanation>" },
    "planB": { "score": <1-5>, "reasoning": "<brief explanation>" }
  },
  "summary": "<2-3 sentence overall comparison>"
}`;
}
