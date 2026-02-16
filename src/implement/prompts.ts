/**
 * Prompt builders for implementation execution and evaluation.
 *
 * Constructs prompts for the agentic AI implementation phase and
 * the blind quality evaluator.
 *
 * @module
 */

/**
 * Build the prompt for an agentic AI implementation run.
 *
 * Asks the AI to implement a task following the provided plan text,
 * optionally including test/build/lint requirements.
 *
 * @param task - The original task description
 * @param planText - The plan markdown from `are plan`
 * @param options - Optional quality gates
 * @returns Prompt string for the Claude CLI
 */
export function buildImplementationPrompt(
  task: string,
  planText: string,
  options: { runTests?: boolean; runBuild?: boolean; runLint?: boolean } = {},
): string {
  const testRequirement = options.runTests
    ? '\n- Write comprehensive tests for all new code'
    : '';
  const buildRequirement = options.runBuild
    ? '\n- Ensure the build passes (run `npm run build`)'
    : '';
  const lintRequirement = options.runLint
    ? '\n- Fix all lint errors and warnings'
    : '';

  return `You are a software engineer. Implement the following task based on the provided implementation plan.

<task>
${task}
</task>

<plan>
${planText}
</plan>

# Requirements
Your implementation should:
- Follow the plan exactly as specified
- Create or modify files as outlined in the plan
- Include proper error handling and edge case coverage
- Write clean, maintainable code${testRequirement}${buildRequirement}${lintRequirement}
- Make atomic commits with clear commit messages

# Instructions
Implement the task step by step, creating/modifying files as needed. After implementation:
1. Verify all changes work correctly
2. Run any required validation (tests, build, lint)
3. Make a final commit summarizing the implementation

Focus on quality, completeness, and adherence to the plan.`;
}

/**
 * Build the prompt for the blind evaluator comparing two implementations.
 *
 * Randomization of plan A/B assignment happens in the evaluator module,
 * not here. This function simply takes the two implementations in order.
 *
 * @param task - The original task description
 * @param implementationA - Implementation log/diff for "Plan A"
 * @param implementationB - Implementation log/diff for "Plan B"
 * @returns Prompt string for the evaluator
 */
export function buildEvaluatorPrompt(
  task: string,
  implementationA: string,
  implementationB: string,
): string {
  return `You are evaluating two implementations of the same task to determine which is higher quality.

<task>
${task}
</task>

<implementation_a>
${implementationA}
</implementation_a>

<implementation_b>
${implementationB}
</implementation_b>

# Evaluation Criteria
Evaluate each implementation on a 1-5 scale (1=poor, 5=excellent) for these criteria:

1. **Code Quality** (30% weight): Clean code, proper structure, good naming, maintainability
2. **Completeness** (25% weight): All requirements implemented, no gaps or TODOs
3. **Test Coverage** (20% weight): Comprehensive tests, edge cases covered
4. **Error Handling** (15% weight): Robust error handling, validation, edge cases
5. **Adherence to Spec** (10% weight): Follows the plan, meets requirements exactly

# Output Format
Return ONLY valid JSON with this exact structure:

\`\`\`json
{
  "codeQuality": {
    "planA": { "score": <1-5>, "reasoning": "<explanation>" },
    "planB": { "score": <1-5>, "reasoning": "<explanation>" }
  },
  "completeness": {
    "planA": { "score": <1-5>, "reasoning": "<explanation>" },
    "planB": { "score": <1-5>, "reasoning": "<explanation>" }
  },
  "testCoverage": {
    "planA": { "score": <1-5>, "reasoning": "<explanation>" },
    "planB": { "score": <1-5>, "reasoning": "<explanation>" }
  },
  "errorHandling": {
    "planA": { "score": <1-5>, "reasoning": "<explanation>" },
    "planB": { "score": <1-5>, "reasoning": "<explanation>" }
  },
  "adherenceToSpec": {
    "planA": { "score": <1-5>, "reasoning": "<explanation>" },
    "planB": { "score": <1-5>, "reasoning": "<explanation>" }
  },
  "summary": "<overall comparison summary>"
}
\`\`\`

Be objective and specific in your reasoning.`;
}
