/* Copyright 2026 Marimo. All rights reserved. */

import { MarkdownParser, SQLParser } from "@marimo-team/smart-cells";
import { CellPluginRegistry } from "@/core/plugins/cell-plugin-registry";

export interface CellPreview {
  text: string | undefined;
  type: string;
}

const markdownParser = new MarkdownParser();
const sqlParser = new SQLParser();

function firstNonEmptyLine(content: string): string | undefined {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Extract a human-readable preview and cell type from raw cell code.
 *
 * For markdown cells (`mo.md(...)`) and SQL cells (`mo.sql(...)`),
 * returns the inner content's first non-empty line instead of the
 * Python wrapper boilerplate.
 */
export function extractCellPreview(code: string): CellPreview {
  const trimmed = code.trim();

  // Check custom plugins first
  for (const parser of CellPluginRegistry.getParsers()) {
    if (parser.isSupported(trimmed)) {
      const { code: inner } = parser.transformIn(trimmed);
      return { text: firstNonEmptyLine(inner), type: parser.type };
    }
  }

  if (markdownParser.isSupported(trimmed)) {
    const { code: inner } = markdownParser.transformIn(trimmed);
    return { text: firstNonEmptyLine(inner), type: "markdown" };
  }

  if (sqlParser.isSupported(trimmed)) {
    const { code: inner } = sqlParser.transformIn(trimmed);
    return { text: firstNonEmptyLine(inner), type: "sql" };
  }

  // Python fallback: first line of raw code
  const firstLine = trimmed.split("\n")[0]?.trim();
  return { text: firstLine || undefined, type: "python" };
}
