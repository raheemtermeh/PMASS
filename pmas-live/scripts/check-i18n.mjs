// Verifies the English and Persian dictionaries expose exactly the same key paths.
// Run with: node scripts/check-i18n.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const i18nDir = join(root, "src", "i18n");

const files = [
  join(i18nDir, "translations.ts"),
  ...readdirSync(join(i18nDir, "dictionaries"))
    .filter((name) => name.endsWith(".ts") && name !== "index.ts")
    .map((name) => join(i18nDir, "dictionaries", name)),
];

function collectPaths(node, prefix, out) {
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
      ? prop.name.text
      : null;
    if (name == null) continue;
    const path = prefix ? `${prefix}.${name}` : name;
    if (ts.isObjectLiteralExpression(prop.initializer)) {
      collectPaths(prop.initializer, path, out);
    } else {
      out.add(path);
    }
  }
}

/** Finds the `en` / `fa` object literals in a dictionary file, whichever shape it uses. */
function readLocales(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const locales = { en: new Set(), fa: new Set() };

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      (node.name.text === "en" || node.name.text === "fa") &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      collectPaths(node.initializer, "", locales[node.name.text]);
      return;
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      (node.name.text === "en" || node.name.text === "fa") &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      collectPaths(node.initializer, "", locales[node.name.text]);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return locales;
}

let failures = 0;
const allEn = new Set();
const allFa = new Set();

for (const file of files) {
  const { en, fa } = readLocales(file);
  const label = relative(root, file);
  const missingFa = [...en].filter((key) => !fa.has(key));
  const missingEn = [...fa].filter((key) => !en.has(key));

  en.forEach((key) => allEn.add(key));
  fa.forEach((key) => allFa.add(key));

  if (missingFa.length || missingEn.length) {
    failures += missingFa.length + missingEn.length;
    console.error(`\n${label}`);
    for (const key of missingFa) console.error(`  missing fa: ${key}`);
    for (const key of missingEn) console.error(`  missing en: ${key}`);
  }
}

console.log(`\nen keys: ${allEn.size}  fa keys: ${allFa.size}`);
if (failures > 0) {
  console.error(`\n${failures} key(s) out of sync.`);
  process.exit(1);
}
console.log("English and Persian dictionaries are in sync.");
