/* Copyright 2026 Marimo. All rights reserved. */

import type { SyntaxNode, TreeCursor } from "@lezer/common";
import dedent from "string-dedent";
import type { FormatResult, LanguageParser, ParseResult } from "../types.js";
import {
  getPrefixLength,
  getStringContent,
  parseArgsKwargs,
  parsePythonAST,
  safeDedent,
} from "../utils/index.js";

export type CypherOutputType = "dataframe" | "visualization";

export interface CypherMetadata {
  dataframeName: string;
  engine: string;
  showOutput: boolean;
  outputType: CypherOutputType;
}

interface CypherParseInfo {
  dfName: string;
  cypherString: string;
  engine: string | undefined;
  output: boolean | undefined;
  outputType: CypherOutputType | undefined;
  startPosition: number;
}

/**
 * Parser for marimo Cypher cells (mo.cypher()).
 *
 * Converts between Python code like `_df = mo.cypher(f"""MATCH (n) RETURN n""", engine=driver)` and
 * plain Cypher like `MATCH (n) RETURN n`.
 */
export class CypherParser implements LanguageParser<CypherMetadata> {
  readonly type = "cypher";

  readonly defaultMetadata: CypherMetadata = {
    dataframeName: "_df",
    engine: "",
    showOutput: true,
    outputType: "dataframe",
  };

  get defaultCode(): string {
    return `_df = mo.cypher(f"""MATCH (n) RETURN n LIMIT 25""", engine=driver)`;
  }

  transformIn(pythonCode: string): ParseResult<CypherMetadata> {
    pythonCode = pythonCode.trim();

    const metadata: CypherMetadata = { ...this.defaultMetadata };

    if (!this.isSupported(pythonCode)) {
      return { code: pythonCode, offset: 0, metadata };
    }

    if (pythonCode === "") {
      return { code: "", offset: 0, metadata };
    }

    const cypherStatement = parseCypherStatement(pythonCode);
    if (cypherStatement) {
      metadata.dataframeName = cypherStatement.dfName;
      metadata.showOutput = cypherStatement.output ?? true;
      metadata.engine = cypherStatement.engine ?? "";
      metadata.outputType = cypherStatement.outputType ?? "dataframe";

      return {
        code: dedent(`\n${cypherStatement.cypherString}\n`).trim(),
        offset: cypherStatement.startPosition,
        metadata,
      };
    }

    return { code: pythonCode, offset: 0, metadata };
  }

  transformOut(code: string, metadata: CypherMetadata): FormatResult {
    const { showOutput, engine, dataframeName, outputType } = metadata;

    const start = `${dataframeName} = mo.cypher(\n    f"""\n`;
    const escapedCode = code.replaceAll('"""', String.raw`\"""`);

    const showOutputParam = showOutput ? "" : ",\n    output=False";
    const outputTypeParam =
      outputType === "visualization"
        ? ',\n    output_type="visualization"'
        : "";
    const engineParam = engine ? `,\n    engine=${engine}` : "";
    const end = `\n    """${showOutputParam}${outputTypeParam}${engineParam}\n)`;

    return {
      code: start + indentOneTab(escapedCode) + end,
      offset: start.length + 1,
    };
  }

  isSupported(pythonCode: string): boolean {
    if (pythonCode.trim() === "") {
      return true;
    }

    if (!pythonCode.includes("mo.cypher")) {
      return false;
    }

    // Does not have 2 `mo.cypher` calls
    if (pythonCode.split("mo.cypher").length > 2) {
      return false;
    }

    return parseCypherStatement(pythonCode) !== null;
  }
}

/**
 * Find an assignment node that is preceded only by comments.
 */
function findAssignment(cursor: TreeCursor): SyntaxNode | null {
  do {
    if (cursor.name === "AssignStatement") {
      return cursor.node;
    }

    if (cursor.name !== "Comment") {
      return null;
    }
  } while (cursor.next());
  return null;
}

/**
 * Parse a Cypher statement from a Python code string.
 */
function parseCypherStatement(code: string): CypherParseInfo | null {
  try {
    const tree = parsePythonAST(code);
    const cursor = tree.cursor();

    if (cursor.name === "Script") {
      cursor.next();
    }
    const assignStmt = findAssignment(cursor);
    if (!assignStmt) {
      return null;
    }

    if (code.slice(assignStmt.to).trim().length > 0) {
      return null;
    }

    let dfName: string | null = null;
    let cypherString: string | null = null;
    let engine: string | undefined;
    let output: boolean | undefined;
    let outputType: CypherOutputType | undefined;
    let startPosition = 0;

    const assignCursor = assignStmt.cursor();
    assignCursor.firstChild();

    if (assignCursor.name === "VariableName") {
      dfName = code.slice(assignCursor.from, assignCursor.to);
    }

    if (!dfName) {
      return null;
    }

    let foundAssignOp = false;
    let rightHandSide: SyntaxNode | null = null;

    while (assignCursor.nextSibling()) {
      if (assignCursor.name === "AssignOp") {
        foundAssignOp = true;
      } else if (foundAssignOp && !rightHandSide) {
        rightHandSide = assignCursor.node;
        break;
      }
    }

    if (!rightHandSide) {
      return null;
    }

    if (
      rightHandSide.name === "ConditionalExpression" ||
      rightHandSide.name === "BinaryExpression" ||
      rightHandSide.name === "UnaryExpression"
    ) {
      return null;
    }

    const rhsCursor = rightHandSide.cursor();
    let callExprNode: SyntaxNode | null = null;

    if (rhsCursor.name === "CallExpression") {
      callExprNode = rhsCursor.node;
    } else {
      rhsCursor.firstChild();
      do {
        if (rhsCursor.name === "CallExpression") {
          callExprNode = rhsCursor.node;
          break;
        }
      } while (rhsCursor.nextSibling());
    }

    if (callExprNode) {
      const callCursor = callExprNode.cursor();
      let isMoCypher = false;

      callCursor.firstChild();
      if (callCursor.name === "MemberExpression") {
        const memberText = code.slice(callCursor.from, callCursor.to);
        isMoCypher = memberText === "mo.cypher";
      }

      if (isMoCypher) {
        while (callCursor.next()) {
          if (callCursor.name === "ArgList") {
            const argListCursor = callCursor.node.cursor();

            const { args, kwargs } = parseArgsKwargs(argListCursor, code);

            if (args.length === 1) {
              cypherString = getStringContent(args[0], code);
              startPosition =
                args[0].from +
                getPrefixLength(code.slice(args[0].from, args[0].to));
            }

            for (const { key, value } of kwargs) {
              switch (key) {
                case "engine":
                  engine = value;
                  break;
                case "output":
                  output = value === "True";
                  break;
                case "output_type":
                  outputType =
                    value === '"visualization"' || value === "'visualization'"
                      ? "visualization"
                      : "dataframe";
                  break;
              }
            }

            if (cypherString === "") {
              return {
                dfName,
                cypherString: "",
                engine,
                output,
                outputType,
                startPosition,
              };
            }

            break;
          }
        }
      }
    }

    if (!dfName || !cypherString) {
      return null;
    }

    return {
      dfName,
      cypherString: safeDedent(cypherString),
      engine,
      output,
      outputType,
      startPosition,
    };
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: warning ok
    console.warn("Failed to parse Cypher statement", error);
    return null;
  }
}

/**
 * Indent code by one tab (4 spaces).
 */
function indentOneTab(code: string): string {
  return code
    .split("\n")
    .map((line) => (line?.trim() ? `    ${line}` : line))
    .join("\n");
}
