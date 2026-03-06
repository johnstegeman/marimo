/* Copyright 2026 Marimo. All rights reserved. */

import * as _CMautocomplete from "@codemirror/autocomplete";
import * as _CMcommands from "@codemirror/commands";
import * as _CMlangSql from "@codemirror/lang-sql";
import * as _CMlint from "@codemirror/lint";
import * as _CMview from "@codemirror/view";
import * as _React from "react";
import * as _ReactDOM from "react-dom";
import * as _ReactJsxRuntime from "react/jsx-runtime";
import type { LanguageParser } from "@marimo-team/smart-cells";
import { Logger } from "@/utils/Logger";
import type { LanguageAdapter } from "../codemirror/language/types";

export interface PluginPanelConnection {
  name: string;
  displayName: string;
  source: string;
}

export interface CellPluginRegistration {
  type: string;
  name: string;
  icon?: React.ReactNode;
  languageAdapter: LanguageAdapter;
  parser: LanguageParser;
  panel?: React.ComponentType<{
    metadata: Record<string, unknown>;
    onChange: (metadata: Record<string, unknown>) => void;
    connections: PluginPanelConnection[];
  }>;
}

class CellPluginRegistryImpl {
  private plugins = new Map<string, CellPluginRegistration>();

  register(plugin: CellPluginRegistration) {
    if (this.plugins.has(plugin.type)) {
      Logger.warn(`Plugin with type ${plugin.type} already registered.`);
    }
    this.plugins.set(plugin.type, plugin);
  }

  get(type: string): CellPluginRegistration | undefined {
    return this.plugins.get(type);
  }

  getAll(): CellPluginRegistration[] {
    return [...this.plugins.values()];
  }

  getAdapters(): LanguageAdapter[] {
    return this.getAll().map((p) => p.languageAdapter);
  }

  getParsers(): LanguageParser[] {
    return this.getAll().map((p) => p.parser);
  }
}

export const CellPluginRegistry = new CellPluginRegistryImpl();

export interface ConnectionPluginRegistration {
  id: string;
  name: string;
  color: string;
  logoUrl?: string;
  form: React.ComponentType<{
    onSubmit: () => void;
    onBack: () => void;
    insertCode: (code: string) => void;
  }>;
}

class ConnectionPluginRegistryImpl {
  private plugins = new Map<string, ConnectionPluginRegistration>();

  register(plugin: ConnectionPluginRegistration) {
    if (this.plugins.has(plugin.id)) {
      Logger.warn(
        `Connection plugin with id ${plugin.id} already registered.`,
      );
    }
    this.plugins.set(plugin.id, plugin);
  }

  get(id: string): ConnectionPluginRegistration | undefined {
    return this.plugins.get(id);
  }

  getAll(): ConnectionPluginRegistration[] {
    return [...this.plugins.values()];
  }
}

export const ConnectionPluginRegistry = new ConnectionPluginRegistryImpl();

// Expose on window for third-party scripts to register themselves
if (typeof window !== "undefined") {
  // Expose CodeMirror modules so plugins can share the same instances
  // and avoid "multiple @codemirror/state instances" errors.
  // @ts-expect-error - Attach to window
  window.__codemirror_autocomplete = _CMautocomplete;
  // @ts-expect-error
  window.__codemirror_commands = _CMcommands;
  // @ts-expect-error
  window.__codemirror_lang_sql = _CMlangSql;
  // @ts-expect-error
  window.__codemirror_lint = _CMlint;
  // @ts-expect-error
  window.__codemirror_view = _CMview;

  // Expose React so plugins can share the same instance.
  // This is critical to avoid React version mismatch errors when
  // plugins render JSX inside marimo's React tree.
  // @ts-expect-error
  window.__react = _React;
  // @ts-expect-error
  window.__react_dom = _ReactDOM;
  // @ts-expect-error
  window.__react_jsx_runtime = _ReactJsxRuntime;

  window.marimo = window.marimo || {};
  // @ts-expect-error - Attach to window
  window.marimo.registerCellPlugin = (plugin: CellPluginRegistration) => {
    CellPluginRegistry.register(plugin);
  };
  // @ts-expect-error - Attach to window
  window.marimo.registerConnectionPlugin = (
    plugin: ConnectionPluginRegistration,
  ) => {
    ConnectionPluginRegistry.register(plugin);
  };
}
