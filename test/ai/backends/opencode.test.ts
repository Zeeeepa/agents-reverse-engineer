/**
 * Unit tests for OpenCodeBackend.parseResponse()
 *
 * Run with: npx tsx test/ai/backends/opencode.test.ts
 */

import assert from 'node:assert/strict';
import { OpenCodeBackend } from '../../../src/ai/backends/opencode.js';
import { AIServiceError } from '../../../src/ai/types.js';

const backend = new OpenCodeBackend();

// ---------------------------------------------------------------------------
// Helper: build NDJSON from event objects
// ---------------------------------------------------------------------------

function ndjson(...events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

function testNormalSingleTurn(): void {
  const stdout = ndjson(
    {
      type: 'step_start',
      timestamp: 1770855934602,
      sessionID: 'ses_test',
      part: { type: 'step-start', snapshot: 'abc123' },
    },
    {
      type: 'text',
      timestamp: 1770855934788,
      sessionID: 'ses_test',
      part: { type: 'text', text: '2 + 2 = 4', time: { start: 1, end: 2 } },
    },
    {
      type: 'step_finish',
      timestamp: 1770855934842,
      sessionID: 'ses_test',
      part: {
        type: 'step-finish',
        reason: 'stop',
        cost: 0,
        tokens: {
          total: 17115,
          input: 2,
          output: 13,
          reasoning: 0,
          cache: { read: 0, write: 17100 },
        },
      },
    },
  );

  const response = backend.parseResponse(stdout, 5000, 0);

  assert.equal(response.text, '2 + 2 = 4');
  assert.equal(response.inputTokens, 2);
  assert.equal(response.outputTokens, 13);
  assert.equal(response.cacheReadTokens, 0);
  assert.equal(response.cacheCreationTokens, 17100);
  assert.equal(response.durationMs, 5000);
  assert.equal(response.exitCode, 0);
  assert.equal(response.model, 'unknown');
  console.log('  PASS: testNormalSingleTurn');
}

function testMultiTurnAggregation(): void {
  const stdout = ndjson(
    // Turn 1
    {
      type: 'text',
      part: { type: 'text', text: 'First part. ' },
    },
    {
      type: 'step_finish',
      part: {
        type: 'step-finish',
        cost: 0,
        tokens: {
          total: 100,
          input: 10,
          output: 50,
          reasoning: 0,
          cache: { read: 20, write: 30 },
        },
      },
    },
    // Turn 2
    {
      type: 'text',
      part: { type: 'text', text: 'Second part.' },
    },
    {
      type: 'step_finish',
      part: {
        type: 'step-finish',
        cost: 0,
        tokens: {
          total: 200,
          input: 5,
          output: 100,
          reasoning: 10,
          cache: { read: 50, write: 40 },
        },
      },
    },
  );

  const response = backend.parseResponse(stdout, 10000, 0);

  assert.equal(response.text, 'First part. Second part.');
  assert.equal(response.inputTokens, 15);   // 10 + 5
  assert.equal(response.outputTokens, 150);  // 50 + 100
  assert.equal(response.cacheReadTokens, 70); // 20 + 50
  assert.equal(response.cacheCreationTokens, 70); // 30 + 40

  const raw = response.raw as Record<string, unknown>;
  assert.equal(raw.numTurns, 2);
  assert.equal(raw.reasoningTokens, 10);
  console.log('  PASS: testMultiTurnAggregation');
}

function testCostCalculationFallback(): void {
  const stdout = ndjson(
    {
      type: 'text',
      part: { type: 'text', text: 'Hello' },
    },
    {
      type: 'step_finish',
      part: {
        type: 'step-finish',
        cost: 0,
        tokens: {
          total: 1000000,
          input: 1000000,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      },
    },
  );

  const response = backend.parseResponse(stdout, 1000, 0);
  const raw = response.raw as Record<string, unknown>;

  // 1M input tokens at $15/MTok = $15.00
  assert.equal(raw.calculatedCost, 15);
  console.log('  PASS: testCostCalculationFallback');
}

function testCostFromProvider(): void {
  const stdout = ndjson(
    {
      type: 'text',
      part: { type: 'text', text: 'Hello' },
    },
    {
      type: 'step_finish',
      part: {
        type: 'step-finish',
        cost: 0.50,
        tokens: {
          total: 100,
          input: 50,
          output: 50,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      },
    },
  );

  const response = backend.parseResponse(stdout, 1000, 0);
  const raw = response.raw as Record<string, unknown>;

  // When cost is provided (non-zero), use it directly
  assert.equal(raw.calculatedCost, 0.50);
  console.log('  PASS: testCostFromProvider');
}

function testEmptyOutput(): void {
  assert.throws(
    () => backend.parseResponse('', 1000, 0),
    (err: unknown) => {
      assert.ok(err instanceof AIServiceError);
      assert.equal(err.code, 'PARSE_ERROR');
      return true;
    },
  );
  console.log('  PASS: testEmptyOutput');
}

function testNoTextEvents(): void {
  const stdout = ndjson(
    {
      type: 'step_start',
      part: { type: 'step-start', snapshot: 'abc' },
    },
    {
      type: 'step_finish',
      part: {
        type: 'step-finish',
        cost: 0,
        tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    },
  );

  assert.throws(
    () => backend.parseResponse(stdout, 1000, 0),
    (err: unknown) => {
      assert.ok(err instanceof AIServiceError);
      assert.equal(err.code, 'PARSE_ERROR');
      assert.ok(err.message.includes('No text content'));
      return true;
    },
  );
  console.log('  PASS: testNoTextEvents');
}

function testMalformedLines(): void {
  const stdout = [
    'not json at all',
    '{"type": "text", "part": {"type": "text", "text": "Good"}}',
    '{broken json',
    '{"type": "step_finish", "part": {"type": "step-finish", "cost": 0, "tokens": {"total": 10, "input": 5, "output": 5, "reasoning": 0, "cache": {"read": 0, "write": 0}}}}',
  ].join('\n');

  const response = backend.parseResponse(stdout, 1000, 0);

  assert.equal(response.text, 'Good');
  assert.equal(response.inputTokens, 5);
  assert.equal(response.outputTokens, 5);
  console.log('  PASS: testMalformedLines');
}

function testEmptyLinesSkipped(): void {
  const stdout = '\n\n' + ndjson(
    {
      type: 'text',
      part: { type: 'text', text: 'Works' },
    },
    {
      type: 'step_finish',
      part: {
        type: 'step-finish',
        cost: 0,
        tokens: { total: 10, input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    },
  ) + '\n\n';

  const response = backend.parseResponse(stdout, 1000, 0);
  assert.equal(response.text, 'Works');
  console.log('  PASS: testEmptyLinesSkipped');
}

function testBuildArgsBasic(): void {
  const args = backend.buildArgs({ prompt: 'Hello' });
  assert.deepEqual(args, ['run', '--format', 'json']);
  console.log('  PASS: testBuildArgsBasic');
}

function testBuildArgsWithModel(): void {
  const args = backend.buildArgs({ prompt: 'Hello', model: 'anthropic/claude-sonnet-4-5' });
  assert.deepEqual(args, ['run', '--format', 'json', '--model', 'anthropic/claude-sonnet-4-5']);
  console.log('  PASS: testBuildArgsWithModel');
}

function testBuildArgsIgnoresUnsupported(): void {
  const args = backend.buildArgs({
    prompt: 'Hello',
    systemPrompt: 'You are a helper',
    maxTurns: 5,
  });
  // systemPrompt and maxTurns should be ignored (not supported by OpenCode)
  assert.deepEqual(args, ['run', '--format', 'json']);
  console.log('  PASS: testBuildArgsIgnoresUnsupported');
}

function testMissingTokensField(): void {
  const stdout = ndjson(
    {
      type: 'text',
      part: { type: 'text', text: 'Hello' },
    },
    {
      type: 'step_finish',
      part: {
        type: 'step-finish',
        cost: 0,
        // tokens field missing entirely
      },
    },
  );

  const response = backend.parseResponse(stdout, 1000, 0);
  assert.equal(response.text, 'Hello');
  assert.equal(response.inputTokens, 0);
  assert.equal(response.outputTokens, 0);
  console.log('  PASS: testMissingTokensField');
}

function testRealWorldOutput(): void {
  // Actual output from `echo "What is 2+2?" | opencode run --format json`
  const stdout = [
    '{"type":"step_start","timestamp":1770855945743,"sessionID":"ses_3b0c2b005ffeEvZyDlhXOsUbl0","part":{"id":"prt_c4f3d560c0016U9d8H8v8XoqFo","sessionID":"ses_3b0c2b005ffeEvZyDlhXOsUbl0","messageID":"msg_c4f3d50fa001GxCA5tZewkwB4p","type":"step-start","snapshot":"fa71f9283ba370c1e048162c6a96eb0fe01488c8"}}',
    '{"type":"text","timestamp":1770855945945,"sessionID":"ses_3b0c2b005ffeEvZyDlhXOsUbl0","part":{"id":"prt_c4f3d5663001AcCWyuqBFiv8CZ","sessionID":"ses_3b0c2b005ffeEvZyDlhXOsUbl0","messageID":"msg_c4f3d50fa001GxCA5tZewkwB4p","type":"text","text":"2 + 2 = 4","time":{"start":1770855945944,"end":1770855945944}}}',
    '{"type":"step_finish","timestamp":1770855946024,"sessionID":"ses_3b0c2b005ffeEvZyDlhXOsUbl0","part":{"id":"prt_c4f3d5713001rPZdb6BB7JY6t4","sessionID":"ses_3b0c2b005ffeEvZyDlhXOsUbl0","messageID":"msg_c4f3d50fa001GxCA5tZewkwB4p","type":"step-finish","reason":"stop","snapshot":"fa71f9283ba370c1e048162c6a96eb0fe01488c8","cost":0,"tokens":{"total":17115,"input":2,"output":13,"reasoning":0,"cache":{"read":0,"write":17100}}}}',
  ].join('\n');

  const response = backend.parseResponse(stdout, 280, 0);

  assert.equal(response.text, '2 + 2 = 4');
  assert.equal(response.inputTokens, 2);
  assert.equal(response.outputTokens, 13);
  assert.equal(response.cacheReadTokens, 0);
  assert.equal(response.cacheCreationTokens, 17100);
  assert.equal(response.durationMs, 280);
  assert.equal(response.exitCode, 0);

  const raw = response.raw as Record<string, unknown>;
  assert.equal(raw.numTurns, 1);
  console.log('  PASS: testRealWorldOutput');
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

console.log('OpenCodeBackend tests:');
console.log('');
console.log('parseResponse():');
testNormalSingleTurn();
testMultiTurnAggregation();
testCostCalculationFallback();
testCostFromProvider();
testEmptyOutput();
testNoTextEvents();
testMalformedLines();
testEmptyLinesSkipped();
testMissingTokensField();
testRealWorldOutput();

console.log('');
console.log('buildArgs():');
testBuildArgsBasic();
testBuildArgsWithModel();
testBuildArgsIgnoresUnsupported();

console.log('');
console.log('All tests passed!');
