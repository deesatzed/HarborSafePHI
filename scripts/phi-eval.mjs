import { evaluatePhiCorpus } from "../src/lib/phi/eval-fixtures.ts";

const report = evaluatePhiCorpus();
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
