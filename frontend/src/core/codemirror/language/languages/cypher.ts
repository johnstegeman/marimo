/* Copyright 2026 Marimo. All rights reserved. */

import { acceptCompletion, autocompletion } from "@codemirror/autocomplete";
import { insertTab } from "@codemirror/commands";
import { sql } from "@codemirror/lang-sql";
import { linter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { CypherParser, type CypherOutputType } from "@marimo-team/smart-cells";
import type { CellId } from "@/core/cells/ids";
import type { PlaceholderType } from "@/core/codemirror/config/types";
import type {
  CompletionConfig,
  DiagnosticsConfig,
  LSPConfig,
} from "@/core/config/config-schema";
import type { HotkeyProvider } from "@/core/hotkeys/hotkeys";
import type { LanguageAdapter } from "../types";

export interface CypherLanguageAdapterMetadata {
  dataframeName: string;
  engine: string;
  showOutput: boolean;
  outputType: CypherOutputType;
}

/**
 * Language adapter for Cypher.
 */
export class CypherLanguageAdapter
  implements LanguageAdapter<CypherLanguageAdapterMetadata>
{
  private parser = new CypherParser();
  readonly type = "cypher" as const;

  get defaultMetadata(): CypherLanguageAdapterMetadata {
    return { ...this.parser.defaultMetadata };
  }

  get defaultCode(): string {
    return this.parser.defaultCode;
  }

  transformIn(
    pythonCode: string,
  ): [
    cypherQuery: string,
    queryStartOffset: number,
    metadata: CypherLanguageAdapterMetadata,
  ] {
    const result = this.parser.transformIn(pythonCode);
    return [result.code, result.offset, result.metadata];
  }

  transformOut(
    code: string,
    metadata: CypherLanguageAdapterMetadata,
  ): [string, number] {
    const result = this.parser.transformOut(code, metadata);
    return [result.code, result.offset];
  }

  isSupported(pythonCode: string): boolean {
    return this.parser.isSupported(pythonCode);
  }

  getExtension(
    _cellId: CellId,
    _completionConfig: CompletionConfig,
    _hotkeys: HotkeyProvider,
    _placeholderType: PlaceholderType,
    lspConfig: LSPConfig & { diagnostics?: DiagnosticsConfig },
  ): Extension[] {
    const extensions: Extension[] = [
      // Use the generic SQL extension for basic syntax highlighting and
      // indentation. Cypher-specific highlighting can be added later.
      sql(),
      keymap.of([
        {
          key: "Tab",
          run: (cm) => {
            return acceptCompletion(cm) || insertTab(cm);
          },
          preventDefault: true,
        },
      ]),
      autocompletion({
        defaultKeymap: false,
        activateOnTyping: false,
        override: [],
      }),
    ];

    const cypherLinterEnabled =
      lspConfig?.diagnostics?.cypher_linter ?? true;
    if (cypherLinterEnabled) {
      extensions.push(cypherLinterExtension());
    }

    return extensions;
  }
}

/**
 * Creates a CodeMirror linter extension for Cypher syntax checking.
 *
 * Uses @neo4j-cypher/editor-support's CypherEditorSupport (backed by an
 * ANTLR4 grammar) to parse the query and surface syntax errors as inline
 * diagnostics. The parser module is loaded lazily via dynamic import so it
 * only contributes to the bundle when a Cypher cell is actually used.
 */
function cypherLinterExtension(): Extension {
  // Lazily resolved parser instance – created once and reused across updates.
  let editorSupportPromise: Promise<InstanceType<
    typeof import("@neo4j-cypher/editor-support").CypherEditorSupport
  > | null> | null = null;

  return linter(
    async (view) => {
      const code = view.state.doc.toString();
      if (!code.trim()) {
        return [];
      }

      if (!editorSupportPromise) {
        editorSupportPromise = import(
          "@neo4j-cypher/editor-support"
        ).then(({ CypherEditorSupport }) => new CypherEditorSupport(code)).catch(() => null);
      }

      const editorSupport = await editorSupportPromise;
      if (!editorSupport) {
        return [];
      }

      editorSupport.update(code);

      // parseErrors exists at runtime but is not in the type definition
      const parseErrors = (
        editorSupport as unknown as {
          parseErrors: Array<{ msg: string; start: number; stop: number }>;
        }
      ).parseErrors;
      return (parseErrors ?? []).map(({ msg, start, stop }) => ({
        severity: "error" as const,
        from: start ?? 0,
        to: (stop ?? 0) + 1,
        message: msg,
      }));
    },
    { delay: 300 },
  );
}
