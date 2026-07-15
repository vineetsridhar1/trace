import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { formatDesignQaReport, validateDesignProject } from "./design-qa";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const report = await validateDesignProject(root);
console.log(formatDesignQaReport(report));
if (report.errors.length > 0) process.exitCode = 1;
