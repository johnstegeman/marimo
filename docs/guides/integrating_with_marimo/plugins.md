# Third-Party Plugins

Marimo has a plugin architecture that lets third-party packages extend the
editor with new cell types, new database connection UIs, or both together.
This guide covers all three cases.

## Overview

A plugin is a Python package that marimo discovers at startup through a
[setuptools entry point](https://packaging.python.org/en/latest/specifications/entry-points/).
The entry point group is `marimo.cell_plugins`. Each entry point must point to
a `CellPlugin` instance (or a callable that returns one).

A `CellPlugin` declares:

| Field | Type | Purpose |
|---|---|---|
| `name` | `str` | Human-readable name, e.g. `"My Language"` |
| `js_bundle_paths` | `list[str]` | Absolute paths to JavaScript bundles marimo will serve |
| `css_bundle_paths` | `list[str]` | Absolute paths to CSS bundles marimo will serve |
| `engine_classes` | `list[type]` | Backend engine classes that implement marimo's `BaseEngine` interface |

When the editor loads, marimo:

1. Discovers all `marimo.cell_plugins` entry points.
2. Serves each declared JS/CSS bundle at `/plugins/{plugin_id}/assets/{filename}`.
3. Injects `<script type="module">` and `<link rel="stylesheet">` tags into
   the page for every bundle.
4. For each variable in a notebook, checks `engine_classes` via
   `is_compatible()` to detect database connections.

**Plugin ID and names:** The **plugin ID** used in URLs and asset paths
(e.g. `/plugins/{plugin_id}/assets/...`) is derived from the Python
`CellPlugin.name`: it is lowercased and any character that is not
alphanumeric, underscore, or hyphen is replaced with a hyphen. Your
frontend `CellPluginRegistration.type` and (for connection plugins)
`ConnectionPluginRegistration.id` should match the plugin ID you
expect from that name—e.g. `name="Cypher"` → ID `cypher` → use
`type: "cypher"` in JS. The **entry point name** in `pyproject.toml`
(e.g. `my-language`) only needs to be unique across installed
packages; it is used for discovery and allowlist/denylist, not as the
plugin ID.

On the JavaScript side, the injected module must call
`window.marimo.registerCellPlugin(...)` and/or
`window.marimo.registerConnectionPlugin(...)` before the page finishes
loading.

---

## Case 1 — Cell type plugin

A cell type plugin adds a new kind of cell to the editor. Cells of this type
appear in the "create cell" menu, get their own syntax highlighting, and are
stored in the notebook as Python code via a transform layer.

### Python package

```
my-marimo-plugin/
├── pyproject.toml
└── my_marimo_plugin/
    ├── __init__.py
    └── plugin.py      # defines the CellPlugin object
    dist/
    └── my_marimo_plugin.js   # your compiled frontend bundle
```

**`my_marimo_plugin/plugin.py`**

```python
from pathlib import Path
from marimo._plugins.core.cell_plugin import CellPlugin

# Absolute path to the compiled JS bundle shipped with your package
_BUNDLE = str(Path(__file__).parent.parent / "dist" / "my_marimo_plugin.js")

plugin = CellPlugin(
    name="My Language",
    js_bundle_paths=[_BUNDLE],
    # css_bundle_paths=[str(Path(__file__).parent.parent / "dist" / "my_marimo_plugin.css")],
)
```

**`pyproject.toml`** (excerpt)

```toml
[project.entry-points."marimo.cell_plugins"]
my-language = "my_marimo_plugin.plugin:plugin"
```

The entry point name (`my-language`) must be unique across all installed
packages. The plugin ID used for asset URLs comes from `CellPlugin.name`
(see [Plugin ID and names](#overview) above); use the same value for
`type` in your JavaScript registration.

### JavaScript bundle

Your bundle is loaded as an ES module (`<script type="module">`). It must call
`window.marimo.registerCellPlugin` with a `CellPluginRegistration` object.

Marimo exposes shared library instances on `window` so that your bundle does
not need to bundle its own copy:

| Window global | Library |
|---|---|
| `window.__react` | React |
| `window.__react_dom` | ReactDOM |
| `window.__react_jsx_runtime` | `react/jsx-runtime` |
| `window.__codemirror_view` | `@codemirror/view` |
| `window.__codemirror_autocomplete` | `@codemirror/autocomplete` |
| `window.__codemirror_commands` | `@codemirror/commands` |
| `window.__codemirror_lang_sql` | `@codemirror/lang-sql` |
| `window.__codemirror_lint` | `@codemirror/lint` |

Mark these as externals in your bundler configuration (Vite, Rollup, esbuild,
etc.) and import them from `window` at runtime instead of bundling them.

#### `CellPluginRegistration` shape

```ts
interface CellPluginRegistration {
  /** Must match the `type` returned by your LanguageAdapter and LanguageParser. */
  type: string;

  /** Display name shown in the UI. */
  name: string;

  /** Optional icon rendered in the "create cell" button. */
  icon?: React.ReactNode;

  /**
   * CodeMirror-based language adapter.
   * Responsible for editor extensions (syntax highlighting, keybindings, etc.)
   * and for transforming code between the internal Python representation and
   * what the user sees in the editor.
   */
  languageAdapter: LanguageAdapter;

  /**
   * Framework-agnostic parser (from @marimo-team/smart-cells).
   * Used outside of the browser (e.g. server-side parsing, export).
   */
  parser: LanguageParser;

  /**
   * Optional React component rendered in the cell toolbar when this cell type
   * is active. Receives the current metadata and database connections.
   */
  panel?: React.ComponentType<{
    metadata: Record<string, unknown>;
    onChange: (metadata: Record<string, unknown>) => void;
    connections: Array<{ name: string; displayName: string; source: string }>;
  }>;
}
```

#### `LanguageAdapter` interface

```ts
interface LanguageAdapter<M = Record<string, any>> {
  readonly type: string;          // e.g. "my-language"
  readonly defaultCode: string;   // code placed in a newly created cell
  readonly defaultMetadata: Readonly<M>;

  /**
   * Called when the editor opens a cell. Strips the Python wrapper from
   * stored code and returns (displayedCode, cursorOffset, metadata).
   */
  transformIn(code: string): [string, number, M];

  /**
   * Called when the editor saves a cell. Wraps the user's code back into
   * valid Python and returns (pythonCode, cursorOffset).
   */
  transformOut(code: string, metadata: M): [string, number];

  /** Returns true if the given Python code belongs to this cell type. */
  isSupported(code: string): boolean;

  /** Returns the CodeMirror extensions to activate for this cell type. */
  getExtension(
    cellId: CellId,
    completionConfig: CompletionConfig,
    hotkeys: HotkeyProvider,
    placeholderType: PlaceholderType,
    lspConfig: LSPConfig & { diagnostics?: DiagnosticsConfig },
  ): Extension[];
}
```

#### `LanguageParser` interface (from `@marimo-team/smart-cells`)

```ts
interface LanguageParser<TMetadata = Record<string, unknown>> {
  readonly type: string;
  readonly defaultCode: string;
  readonly defaultMetadata: Readonly<TMetadata>;

  transformIn(pythonCode: string): { code: string; offset: number; metadata: TMetadata };
  transformOut(code: string, metadata: TMetadata): { code: string; offset: number };
  isSupported(pythonCode: string): boolean;
}
```

#### Minimal registration example

```js
// my_marimo_plugin.js  (ES module)

const React = window.__react;
const { EditorView } = window.__codemirror_view;

class MyLanguageAdapter {
  type = "my-language";
  defaultCode = 'mo.my_language("""\n\n""")';
  defaultMetadata = {};

  transformIn(code) {
    // Strip the Python wrapper, return raw language code
    const match = code.match(/mo\.my_language\("""([\s\S]*)"""\)/);
    const inner = match ? match[1] : code;
    const offset = code.indexOf(inner);
    return [inner, offset, {}];
  }

  transformOut(code, _metadata) {
    const wrapped = `mo.my_language("""\n${code}\n""")`;
    const offset = wrapped.indexOf(code);
    return [wrapped, offset];
  }

  isSupported(code) {
    return code.includes("mo.my_language(");
  }

  getExtension(_cellId, _completionConfig, _hotkeys, _placeholderType, _lsp) {
    // Return CodeMirror extensions for syntax highlighting, etc.
    return [];
  }
}

class MyLanguageParser {
  type = "my-language";
  defaultCode = 'mo.my_language("""\n\n""")';
  defaultMetadata = {};

  transformIn(pythonCode) {
    const match = pythonCode.match(/mo\.my_language\("""([\s\S]*)"""\)/);
    const code = match ? match[1] : pythonCode;
    return { code, offset: pythonCode.indexOf(code), metadata: {} };
  }

  transformOut(code, _metadata) {
    const out = `mo.my_language("""\n${code}\n""")`;
    return { code: out, offset: out.indexOf(code) };
  }

  isSupported(pythonCode) {
    return pythonCode.includes("mo.my_language(");
  }
}

window.marimo.registerCellPlugin({
  type: "my-language",
  name: "My Language",
  languageAdapter: new MyLanguageAdapter(),
  parser: new MyLanguageParser(),
});
```

---

## Case 2 — Database connection plugin

A database connection plugin does two things:

1. **Backend**: Teaches marimo how to execute queries against a new database by
   implementing the `BaseEngine` class hierarchy.
2. **Frontend**: Adds a connection form to the datasource panel UI so users can
   configure and insert connection code.

### Python package

```
my-db-plugin/
├── pyproject.toml
└── my_db_plugin/
    ├── __init__.py
    ├── engine.py      # BaseEngine subclass
    └── plugin.py      # CellPlugin object
    dist/
    └── my_db_plugin.js
```

#### Engine class hierarchy

Choose the right base class depending on what your connection supports:

| Class | Use when |
|---|---|
| `QueryEngine` | The connection can execute SQL queries but does not expose schema metadata. |
| `EngineCatalog` | The connection exposes schema/table metadata but cannot execute queries. |
| `SQLConnection` | The connection supports both query execution and catalog introspection (most common). |

All three inherit from `BaseEngine`, which requires three abstract members:

```python
from marimo._sql.engines.types import SQLConnection, InferenceConfig
from marimo._data.models import Database, DataTable
from typing import Any, Optional

class MyDBEngine(SQLConnection["my_lib.Connection"]):

    @property
    def source(self) -> str:
        """The library name, shown in the UI (e.g. 'mydb')."""
        return "mydb"

    @property
    def dialect(self) -> str:
        """The sqlglot dialect string for SQL parsing/formatting."""
        return "mysql"  # or "postgres", "duckdb", etc.

    @staticmethod
    def is_compatible(var: Any) -> bool:
        """Return True if `var` is a connection object this engine can wrap."""
        try:
            import my_lib
            return isinstance(var, my_lib.Connection)
        except ImportError:
            return False

    # --- QueryEngine ---

    def execute(self, query: str) -> Any:
        """Execute a SQL query and return a DataFrame (or native result)."""
        cursor = self._connection.cursor()
        cursor.execute(query)
        rows = cursor.fetchall()
        columns = [d[0] for d in cursor.description or []]

        sql_output = self.sql_output_format()

        if sql_output in ("polars", "lazy-polars"):
            import polars as pl
            return pl.DataFrame({c: [r[i] for r in rows] for i, c in enumerate(columns)})
        elif sql_output == "pandas":
            import pandas as pd
            return pd.DataFrame(rows, columns=columns)
        else:
            return rows

    # --- EngineCatalog ---

    @property
    def inference_config(self) -> InferenceConfig:
        """Controls how eagerly marimo introspects the schema on startup."""
        return InferenceConfig(
            auto_discover_schemas=True,
            auto_discover_tables="auto",
            auto_discover_columns=False,
        )

    def get_default_database(self) -> Optional[str]:
        return self._connection.database

    def get_default_schema(self) -> Optional[str]:
        return "public"

    def get_databases(self, *, include_schemas, include_tables, include_table_details) -> list[Database]:
        # Return a list of marimo Database objects describing the catalog.
        # See marimo._data.models.Database for the dataclass definition.
        return []

    def get_tables_in_schema(self, *, schema, database, include_table_details) -> list[DataTable]:
        return []

    def get_table_details(self, *, table_name, schema_name, database_name) -> Optional[DataTable]:
        return None
```

**`my_db_plugin/plugin.py`**

```python
from pathlib import Path
from marimo._plugins.core.cell_plugin import CellPlugin
from my_db_plugin.engine import MyDBEngine

_BUNDLE = str(Path(__file__).parent.parent / "dist" / "my_db_plugin.js")

plugin = CellPlugin(
    name="MyDB",
    js_bundle_paths=[_BUNDLE],
    engine_classes=[MyDBEngine],
)
```

**`pyproject.toml`** (excerpt)

```toml
[project.entry-points."marimo.cell_plugins"]
mydb = "my_db_plugin.plugin:plugin"
```

### JavaScript bundle — connection form

The frontend bundle calls `window.marimo.registerConnectionPlugin` to add a
connection form to the datasource panel. When a user fills in the form and
submits, `insertCode` is called with a Python snippet that marimo inserts into
a new cell.

```ts
interface ConnectionPluginRegistration {
  /** Must be unique. Use the same value as your Python plugin's `name`. */
  id: string;

  /** Display name shown in the "Add connection" list. */
  name: string;

  /** Brand colour used in the connection card (hex or CSS colour string). */
  color: string;

  /** Optional URL for a logo image (can be a data URI). */
  logoUrl?: string;

  /**
   * React component that renders the connection form.
   *
   * onSubmit  — call when the user confirms the connection.
   * onBack    — call when the user cancels / goes back.
   * insertCode — call with generated Python code to insert a new cell.
   */
  form: React.ComponentType<{
    onSubmit: () => void;
    onBack: () => void;
    insertCode: (code: string) => void;
  }>;
}
```

#### Minimal registration example

```js
// my_db_plugin.js  (ES module)

const React = window.__react;
const { useState } = React;

function MyDBForm({ onSubmit, onBack, insertCode }) {
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [db, setDb] = useState("mydb");

  const handleConnect = () => {
    const code = [
      "import my_lib",
      `conn = my_lib.connect(host="${host}", port=${port}, database="${db}")`,
    ].join("\n");
    insertCode(code);
    onSubmit();
  };

  return React.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 8 } },
    React.createElement("input", {
      placeholder: "Host",
      value: host,
      onChange: (e) => setHost(e.target.value),
    }),
    React.createElement("input", {
      placeholder: "Port",
      value: port,
      onChange: (e) => setPort(e.target.value),
    }),
    React.createElement("input", {
      placeholder: "Database",
      value: db,
      onChange: (e) => setDb(e.target.value),
    }),
    React.createElement(
      "div",
      { style: { display: "flex", gap: 8 } },
      React.createElement("button", { onClick: onBack }, "Back"),
      React.createElement("button", { onClick: handleConnect }, "Connect"),
    ),
  );
}

window.marimo.registerConnectionPlugin({
  id: "mydb",
  name: "MyDB",
  color: "#0055ff",
  logoUrl: "https://example.com/mydb-logo.png",
  form: MyDBForm,
});
```

---

## Case 3 — Combined plugin

A combined plugin adds both a new cell type and a new database connection. This
is the most common pattern when your library has its own query language.

### Python package

Declare everything in one `CellPlugin`:

```python
from pathlib import Path
from marimo._plugins.core.cell_plugin import CellPlugin
from my_combined_plugin.engine import MyCombinedEngine

_BUNDLE = str(Path(__file__).parent.parent / "dist" / "my_combined_plugin.js")

plugin = CellPlugin(
    name="My Combined Plugin",
    js_bundle_paths=[_BUNDLE],
    engine_classes=[MyCombinedEngine],  # enables datasource detection
)
```

**`pyproject.toml`** (excerpt)

```toml
[project.entry-points."marimo.cell_plugins"]
my-combined = "my_combined_plugin.plugin:plugin"
```

### JavaScript bundle

The bundle must call both `registerCellPlugin` and `registerConnectionPlugin`.
Since both registrations share the same module, you can reuse components and
keep the bundle small.

```js
// my_combined_plugin.js  (ES module)

const React = window.__react;

// --- Cell type plugin ---

class MyCombinedAdapter {
  type = "my-combined";
  defaultCode = 'my_lib.query("""\n\n""")';
  defaultMetadata = { connection: null };

  transformIn(code) { /* ... */ }
  transformOut(code, metadata) { /* ... */ }
  isSupported(code) { return code.includes("my_lib.query("); }
  getExtension() { return []; }
}

class MyCombinedParser {
  type = "my-combined";
  defaultCode = 'my_lib.query("""\n\n""")';
  defaultMetadata = { connection: null };

  transformIn(pythonCode) { /* ... */ }
  transformOut(code, metadata) { /* ... */ }
  isSupported(pythonCode) { return pythonCode.includes("my_lib.query("); }
}

// Optional toolbar panel that shows available connections
function MyCombinedPanel({ metadata, onChange, connections }) {
  const myConnections = connections.filter((c) => c.source === "my-lib");

  return React.createElement(
    "select",
    {
      value: metadata.connection || "",
      onChange: (e) => onChange({ connection: e.target.value }),
    },
    React.createElement("option", { value: "" }, "Default connection"),
    ...myConnections.map((c) =>
      React.createElement("option", { key: c.name, value: c.name }, c.displayName),
    ),
  );
}

window.marimo.registerCellPlugin({
  type: "my-combined",
  name: "My Combined Plugin",
  languageAdapter: new MyCombinedAdapter(),
  parser: new MyCombinedParser(),
  panel: MyCombinedPanel,
});

// --- Database connection plugin ---

function MyCombinedForm({ onBack, insertCode, onSubmit }) {
  const handleConnect = () => {
    insertCode('import my_lib\nconn = my_lib.connect()');
    onSubmit();
  };
  return React.createElement(
    "div",
    null,
    React.createElement("button", { onClick: onBack }, "Back"),
    React.createElement("button", { onClick: handleConnect }, "Connect"),
  );
}

window.marimo.registerConnectionPlugin({
  id: "my-combined",
  name: "My Combined Plugin",
  color: "#7c3aed",
  form: MyCombinedForm,
});
```

---

## Behavior and lifecycle

**Plugin order and matching:** When marimo decides which cell type or
parser applies to a piece of code, it checks adapters and parsers in
registration order (built-ins first, then plugins in the order their
scripts load). The **first** adapter or parser whose `isSupported()`
returns true wins. If multiple plugins could match the same content,
script load order therefore matters; keep cell patterns distinct when
possible.

**Duplicate registration:** If the same cell type (`type`) or
connection plugin (`id`) is registered more than once (e.g. two bundles
register `type: "cypher"`), the **last** registration wins and
overwrites the previous one. Avoid registering the same type or id
from multiple packages.

**Server startup:** Plugin discovery for the UI—which plugins get
asset tags and which connection types appear in the datasource
panel—runs when the marimo **server** starts. Installing or removing a
plugin after the server is running will not update the UI until you
restart the server.

---

## Allowing and denying plugins

Marimo supports environment-variable-based allowlists and denylists for the
`marimo.cell_plugins` entry point group. The variable names are derived from
the entry point group name:

```bash
# Only load these plugins (comma-separated)
MARIMO_CELL_PLUGINS_ALLOWLIST=my-language,mydb

# Never load these plugins (comma-separated, checked before allowlist)
MARIMO_CELL_PLUGINS_DENYLIST=untrusted-plugin
```

---

## Complete package checklist

### Python

- [ ] `CellPlugin` object exported from a module in your package
- [ ] `pyproject.toml` entry point under `marimo.cell_plugins`
- [ ] Engine class with `source`, `dialect`, `is_compatible()`, and the
      appropriate query/catalog methods (if adding a database connection)
- [ ] Absolute path(s) to compiled JS/CSS bundles stored inside the package
      (e.g. in a `dist/` subdirectory)

### JavaScript / TypeScript

- [ ] Bundle built as an ES module
- [ ] Shared libraries (React, CodeMirror) declared as externals and accessed
      via `window.__react`, `window.__codemirror_*`
- [ ] `window.marimo.registerCellPlugin(...)` called at module evaluation time
      (if adding a cell type)
- [ ] `window.marimo.registerConnectionPlugin(...)` called at module
      evaluation time (if adding a connection form)
- [ ] `type` field in `CellPluginRegistration` matches the `type` in your
      `LanguageAdapter` and `LanguageParser`

### Distribution

- [ ] Compiled JS/CSS bundles included in the Python package (`MANIFEST.in`,
      `package-data`, or equivalent)
- [ ] Package installable with `pip install my-plugin` or
      `uv add my-plugin`
