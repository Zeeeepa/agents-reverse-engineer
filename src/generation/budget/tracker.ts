import { countTokens } from './counter.js';

export interface BudgetReport {
  totalBudget: number;
  used: number;
  remaining: number;
  percentUsed: number;
  filesProcessed: number;
  filesRemaining: number;
  averagePerFile: number;
  exhausted: boolean;
  completedFiles: string[];
  skippedFiles: string[];
}

export interface FileEstimate {
  filePath: string;
  tokens: number;
  canProcess: boolean;
}

/**
 * Tracks token budget across the entire project.
 * Enforces budget limits and reports progress.
 */
export class BudgetTracker {
  private totalBudget: number;
  private used: number = 0;
  private filesProcessed: number = 0;
  private totalFiles: number;
  private completedFiles: string[] = [];
  private skippedFiles: string[] = [];

  constructor(totalBudget: number, totalFiles: number) {
    this.totalBudget = totalBudget;
    this.totalFiles = totalFiles;
  }

  /**
   * Check if there's enough budget to process a file.
   */
  canProcess(estimatedTokens: number): boolean {
    return this.remaining >= estimatedTokens;
  }

  /**
   * Get remaining budget.
   */
  get remaining(): number {
    return this.totalBudget - this.used;
  }

  /**
   * Estimate tokens for a file and check if it can be processed.
   */
  estimate(filePath: string, content: string, promptOverhead: number): FileEstimate {
    const contentTokens = countTokens(content);
    const totalTokens = contentTokens + promptOverhead;

    return {
      filePath,
      tokens: totalTokens,
      canProcess: this.canProcess(totalTokens),
    };
  }

  /**
   * Record that a file was processed, consuming budget.
   */
  recordProcessed(filePath: string, tokensUsed: number): void {
    this.used += tokensUsed;
    this.filesProcessed++;
    this.completedFiles.push(filePath);
  }

  /**
   * Record that a file was skipped due to budget constraints.
   */
  recordSkipped(filePath: string): void {
    this.skippedFiles.push(filePath);
  }

  /**
   * Check if budget is exhausted (should stop processing).
   */
  isExhausted(): boolean {
    return this.remaining <= 0;
  }

  /**
   * Get a report of budget status.
   */
  getReport(): BudgetReport {
    return {
      totalBudget: this.totalBudget,
      used: this.used,
      remaining: this.remaining,
      percentUsed: this.totalBudget > 0 ? (this.used / this.totalBudget) * 100 : 0,
      filesProcessed: this.filesProcessed,
      filesRemaining: this.totalFiles - this.filesProcessed,
      averagePerFile: this.filesProcessed > 0 ? this.used / this.filesProcessed : 0,
      exhausted: this.isExhausted(),
      completedFiles: [...this.completedFiles],
      skippedFiles: [...this.skippedFiles],
    };
  }

  /**
   * Create a summary message for CLI output.
   */
  getSummaryMessage(): string {
    const report = this.getReport();
    const lines = [
      `Token budget: ${report.used.toLocaleString()} / ${report.totalBudget.toLocaleString()} (${report.percentUsed.toFixed(1)}%)`,
      `Files processed: ${report.filesProcessed} / ${this.totalFiles}`,
    ];

    if (report.skippedFiles.length > 0) {
      lines.push(`Files skipped (budget): ${report.skippedFiles.length}`);
    }

    if (report.exhausted) {
      lines.push('Budget exhausted - some files were not processed');
    }

    return lines.join('\n');
  }
}
