// One-time/idempotent source annotation helper. The emitted decorators remain reviewable source.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(
    new URL("../apps/api/package.json", import.meta.url),
  ),
  ts = require("typescript");
let added = 0;
for (const file of readdirSync("apps/api/src").filter((f) =>
  f.endsWith(".ts"),
)) {
  const path = "apps/api/src/" + file;
  let source = readFileSync(path, "utf8");
  const ast = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
    edits = [];
  for (const node of ast.statements) {
    if (!ts.isClassDeclaration(node)) continue;
    for (const field of node.members) {
      if (
        !ts.isPropertyDeclaration(field) ||
        !field.name ||
        !ts.isIdentifier(field.name)
      )
        continue;
      const decorators = ts.getDecorators(field) ?? [],
        calls = decorators.map((d) => d.expression).filter(ts.isCallExpression),
        byName = new Map(
          calls
            .filter((c) => ts.isIdentifier(c.expression))
            .map((c) => [c.expression.text, c]),
        );
      if (byName.has("ApiProperty") || byName.has("ApiPropertyOptional"))
        continue;
      if (
        ![...byName.keys()].some(
          (n) =>
            n.startsWith("Is") ||
            ["Matches", "Length", "ValidateNested"].includes(n),
        )
      )
        continue;
      const options = [],
        type = field.type?.getText(ast) ?? "",
        nullable = type.includes("null"),
        optional =
          !!field.questionToken ||
          !!field.initializer ||
          byName.has("ValidateIf") ||
          byName.has("IsOptional");
      if (optional) options.push("required:false");
      if (nullable) options.push("nullable:true");
      const arg = (name, index = 0) =>
        byName.get(name)?.arguments[index]?.getText(ast);
      const array = byName.has("IsArray") || type.endsWith("[]");
      const nested = arg("Type");
      const nestedName = nested?.match(/=>\s*([A-Za-z_$][\w$]*)\s*$/)?.[1];
      if (array) {
        const item = type.replace(/\[\]$/, "");
        const inner =
          byName.has("IsUUID") || item === "string"
            ? "String"
            : item === "number"
              ? "Number"
              : (nestedName ?? item);
        if (/^[A-Za-z_$][\w$]*$/.test(inner))
          options.push("type:()=>[" + inner + "]");
        else options.push("type:[String]");
        if (byName.has("ArrayMinSize"))
          options.push("minItems:" + arg("ArrayMinSize"));
        if (byName.has("ArrayMaxSize"))
          options.push("maxItems:" + arg("ArrayMaxSize"));
      } else if (byName.has("IsIn")) options.push("enum:" + arg("IsIn"));
      else if (nestedName && byName.has("ValidateNested"))
        options.push("type:()=>" + nestedName);
      else if (
        byName.has("IsBoolean") ||
        type === "boolean" ||
        field.initializer?.kind === ts.SyntaxKind.TrueKeyword ||
        field.initializer?.kind === ts.SyntaxKind.FalseKeyword
      )
        options.push("type:Boolean");
      else if (
        byName.has("IsInt") ||
        byName.has("IsNumber") ||
        type.replace(/\s*\|\s*null/, "") === "number"
      )
        options.push(
          "type:" + JSON.stringify(byName.has("IsInt") ? "integer" : "number"),
        );
      else options.push("type:String");
      if (!array && byName.has("IsUUID")) options.push('format:"uuid"');
      if (byName.has("IsEmail")) options.push('format:"email"');
      if (byName.has("IsDateString")) options.push('format:"date-time"');
      for (const [validator, key] of [
        ["Min", "minimum"],
        ["Max", "maximum"],
        ["MinLength", "minLength"],
        ["MaxLength", "maxLength"],
      ])
        if (byName.has(validator)) options.push(key + ":" + arg(validator));
      if (byName.has("Length"))
        options.push(
          "minLength:" + arg("Length") + ",maxLength:" + arg("Length", 1),
        );
      const regex = arg("Matches");
      if (regex?.startsWith("/") && regex.endsWith("/"))
        options.push("pattern:" + JSON.stringify(regex.slice(1, -1)));
      if (
        field.initializer &&
        [
          ts.SyntaxKind.StringLiteral,
          ts.SyntaxKind.NumericLiteral,
          ts.SyntaxKind.TrueKeyword,
          ts.SyntaxKind.FalseKeyword,
        ].includes(field.initializer.kind)
      )
        options.push("default:" + field.initializer.getText(ast));
      edits.push({
        start: field.getStart(ast),
        text: "@ApiProperty({" + options.join(",") + "}) ",
      });
    }
  }
  if (edits.length) {
    for (const edit of edits.sort((a, b) => b.start - a.start))
      source =
        source.slice(0, edit.start) + edit.text + source.slice(edit.start);
    if (
      !/import[\s\S]*?\bApiProperty\b[\s\S]*?from\s*["']@nestjs\/swagger["']/.test(
        source,
      )
    )
      source = 'import {ApiProperty} from "@nestjs/swagger";\n' + source;
    writeFileSync(path, source);
    added += edits.length;
  }
}
console.log("Added " + added + " explicit OpenAPI property annotations");
