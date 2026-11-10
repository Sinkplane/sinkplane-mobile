import { globSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { type AST, Linter, type Rule } from 'eslint';
import tseslint from 'typescript-eslint';

type SourceLocation = AST.SourceLocation;
type Position = SourceLocation['start'];

interface FunctionComplexity {
  readonly file: string;
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly complexity: number;
}

interface CrapScore extends FunctionComplexity {
  readonly coverage: number;
  readonly crap: number;
}

interface FileCoverage {
  readonly statementMap: Record<string, { readonly start: { readonly line: number } }>;
  readonly s: Record<string, number>;
}

type CoverageReport = Record<string, FileCoverage | undefined>;

// Unit tests cover components/hooks/utils; route modules (src/app) are only exercised end to end.
// A line counts as covered when either suite ran it.
const COVERAGE_FILES = ['coverage/unit/coverage-final.json', 'coverage/e2e/coverage-final.json'];
const SOURCE_GLOB = 'src/**/*.{ts,tsx}';
const NOT_MEASURED = /\.test\.tsx?$|\.d\.ts$|^src\/shared\.ts$/;
const COMPLEXITY_MESSAGE = /^(.+) has a complexity of (\d+)\./;
const WORST_SHOWN = 10;
const PERCENT = 100;
const COLUMN_WIDTH = { crap: 6, complexity: 3, coverage: 5 };
const crapMax = Number(process.env['CRAP_MAX'] ?? '6');

function fail(message: string): never {
  process.stderr.write(`crap: ${message}\n`);
  process.exit(1);
}

function sourceFiles(): string[] {
  return globSync(SOURCE_GLOB).filter((file) => !NOT_MEASURED.test(file));
}

function functionRecorder(found: SourceLocation[]): Rule.RuleModule {
  const record = (node: Rule.Node): void => {
    if (node.loc) {
      found.push(node.loc);
    }
  };
  return {
    create: () => ({ 'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression': record }),
  };
}

function isAtOrBefore(a: Position, b: Position): boolean {
  return a.line < b.line || (a.line === b.line && a.column <= b.column);
}

// A complexity report only carries the function head's location; coverage needs the whole body,
// which is the innermost function containing the end of that head.
function bodyEndLine(functions: readonly SourceLocation[], message: Linter.LintMessage): number {
  const headEnd = {
    line: message.endLine ?? message.line,
    column: (message.endColumn ?? message.column) - 1,
  };
  const enclosing = functions
    .filter((fn) => isAtOrBefore(fn.start, headEnd) && isAtOrBefore(headEnd, fn.end))
    .sort((a, b) => (isAtOrBefore(a.start, b.start) ? 1 : -1));
  return enclosing[0]?.end.line ?? headEnd.line;
}

function toFunctionComplexity(
  file: string,
  functions: readonly SourceLocation[],
  message: Linter.LintMessage,
): FunctionComplexity {
  const [, name = '?', complexity = '0'] = COMPLEXITY_MESSAGE.exec(message.message) ?? [];
  return {
    file,
    name,
    startLine: message.line,
    endLine: bodyEndLine(functions, message),
    complexity: Number(complexity),
  };
}

function measureComplexity(file: string): FunctionComplexity[] {
  const functions: SourceLocation[] = [];
  const messages = new Linter().verify(
    readFileSync(file, 'utf8'),
    {
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: file.endsWith('.tsx') } },
      },
      plugins: { crap: { rules: { functions: functionRecorder(functions) } } },
      rules: { complexity: ['error', 0], 'crap/functions': 'error' },
    },
    { filename: file },
  );
  const fatal = messages.find((message) => message.fatal === true);
  if (fatal !== undefined) {
    fail(`${file}:${String(fatal.line)}: ${fatal.message}`);
  }
  return messages.map((message) => toFunctionComplexity(file, functions, message));
}

function readReport(path: string): CoverageReport {
  const reportTime = statSync(path, { throwIfNoEntry: false })?.mtimeMs;
  if (reportTime === undefined) {
    fail(`${path} not found. Run \`make coverage\` first.`);
  }
  const stale = globSync(SOURCE_GLOB).find((file) => statSync(file).mtimeMs > reportTime);
  if (stale !== undefined) {
    fail(`${path} is older than ${stale}. Run \`make coverage\` first.`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as CoverageReport;
}

function addLineHits(
  hits: Map<number, number>,
  coverage: FileCoverage,
  fn: FunctionComplexity,
): void {
  for (const [id, location] of Object.entries(coverage.statementMap)) {
    const line = location.start.line;
    if (line >= fn.startLine && line <= fn.endLine) {
      hits.set(line, Math.max(hits.get(line) ?? 0, coverage.s[id] ?? 0));
    }
  }
}

function lineCoverage(coverages: readonly FileCoverage[], fn: FunctionComplexity): number {
  const hits = new Map<number, number>();
  for (const coverage of coverages) {
    addLineHits(hits, coverage, fn);
  }
  if (hits.size === 0) {
    return 0;
  }
  return [...hits.values()].filter((count) => count > 0).length / hits.size;
}

function crapScore(complexity: number, coverage: number): number {
  const uncovered = 1 - coverage;
  return complexity * complexity * uncovered * uncovered * uncovered + complexity;
}

function score(reports: readonly CoverageReport[], fn: FunctionComplexity): CrapScore {
  const path = resolve(fn.file);
  const coverages = reports.flatMap((report) => report[path] ?? []);
  const coverage = lineCoverage(coverages, fn);
  return { ...fn, coverage, crap: crapScore(fn.complexity, coverage) };
}

function formatRow(fn: CrapScore): string {
  const crap = fn.crap.toFixed(1).padStart(COLUMN_WIDTH.crap);
  const complexity = String(fn.complexity).padStart(COLUMN_WIDTH.complexity);
  const coverage = `${(fn.coverage * PERCENT).toFixed(0)}%`.padStart(COLUMN_WIDTH.coverage);
  return `${crap} ${complexity} ${coverage}  ${fn.file}:${String(fn.startLine)}  ${fn.name}`;
}

function main(): void {
  const reports = COVERAGE_FILES.map(readReport);
  const scores = sourceFiles()
    .flatMap(measureComplexity)
    .map((fn) => score(reports, fn))
    .sort((a, b) => b.crap - a.crap);
  const out = process.stdout;
  out.write(
    `Worst ${String(WORST_SHOWN)} of ${String(scores.length)} functions (CRAP_MAX=${String(crapMax)}):\n`,
  );
  out.write('  CRAP  CC   COV  LOCATION  FUNCTION\n');
  out.write(`${scores.slice(0, WORST_SHOWN).map(formatRow).join('\n')}\n`);
  const offenders = scores.filter((fn) => fn.crap > crapMax);
  if (offenders.length > 0) {
    fail(
      `${String(offenders.length)} function(s) above CRAP_MAX=${String(crapMax)}:\n${offenders.map(formatRow).join('\n')}\n` +
        'Cover the untested lines first, then reduce complexity (see the cleaner skill).',
    );
  }
}

main();
