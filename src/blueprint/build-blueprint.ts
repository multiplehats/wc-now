import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWooCommerceBlueprint } from "./generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Generate the default blueprint
const defaultBlueprint = generateWooCommerceBlueprint();

// Write to the root directory
const outputPath = join(__dirname, "../../blueprint.json");
writeFileSync(outputPath, JSON.stringify(defaultBlueprint, null, 2));

console.log(`✅ Generated blueprint.json at ${outputPath}`);
