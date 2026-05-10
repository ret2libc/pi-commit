import { runExtensionTests } from "./extension.test.ts";
import { runHelperTests } from "./helpers.test.ts";

async function main() {
  const suites = [
    ["helper functions", runHelperTests],
    ["extension behavior", runExtensionTests],
  ] as const;

  for (const [name, suite] of suites) {
    process.stdout.write(`Running ${name}...\n`);
    await suite();
    process.stdout.write(`Passed ${name}.\n`);
  }

  process.stdout.write("All tests passed.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
