---
description: "Query Neo4j graph databases with Cypher in marimo notebooks. Write Cypher queries, visualize graph results, and integrate Neo4j into your reactive workflows."
---

# Using Cypher

marimo lets you write **Cypher queries** against Neo4j graph databases directly
in your notebook. Query results are returned as Python dataframes and fit into
marimo's reactive dataflow graph — just like SQL cells.

## Installation

You'll need the `neo4j` Python driver:

/// tab | install with pip

```bash
pip install neo4j
```

///

/// tab | install with uv

```bash
uv add neo4j
```

///

To visualize graph results, also install `neo4j-viz`:

/// tab | install with pip

```bash
pip install neo4j-viz
```

///

/// tab | install with uv

```bash
uv add neo4j-viz
```

///

## Connecting to Neo4j

Create a Neo4j driver in a Python cell:

```python
import neo4j

driver = neo4j.GraphDatabase.driver(
    "neo4j://localhost:7687",
    auth=("neo4j", "password"),
)
```

marimo will auto-discover the driver and let you select it in the Cypher cell's
connection dropdown. You can also pass it explicitly via the `engine` argument.

## Creating Cypher cells

You can create a Cypher cell in one of three ways:

1. Click the **Cypher** button at the bottom of the notebook
2. **Right-click** an "add cell" button ("+" icon) next to a cell and choose "Cypher cell"
3. Convert an empty Python cell to Cypher via the language toggle (hover over the cell)

This creates a Cypher cell, which is syntactic sugar for Python code. The
underlying code looks like:

```python
_df = mo.cypher(f"""MATCH (n) RETURN n LIMIT 25""", engine=driver)
```

The result is a **Polars DataFrame** (if you have `polars` installed) or
**Pandas DataFrame**, stored in the output variable.

## Parameterized queries

Like SQL cells, Cypher cells use Python f-strings, so you can interpolate
Python values directly:

```cypher
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
WHERE m.released >= {min_year.value}
RETURN p.name, m.title
ORDER BY m.released
```

This means your queries can depend on UI elements (sliders, dropdowns, etc.)
and will automatically re-run when those values change.

## Output types

### Dataframe (default)

By default, query results are returned as a dataframe:

```python
_df = mo.cypher(f"""MATCH (n:Person) RETURN n.name AS name LIMIT 25""", engine=driver)
```

### Graph visualization

When `output_type="visualization"`, results are rendered as an interactive
graph using [neo4j-viz](https://github.com/neo4j/neo4j-viz):

```python
_graph = mo.cypher(
    f"""MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p, r, m LIMIT 50""",
    engine=driver,
    output_type="visualization",
)
```

This requires `neo4j-viz` to be installed.

## Connection panel

You can manage Neo4j connections through the **Data Sources panel** in the
sidebar. Click the "Add Database Connection" button to enter your Neo4j
connection details through the UI.

## Linting

Cypher cells include a built-in syntax linter that highlights errors as you
type. To disable it, set `cypher_linter` to `false` in your `pyproject.toml`:

```toml title="pyproject.toml"
[tool.marimo.diagnostics]
cypher_linter = false
```

## `mo.cypher` API

::: marimo.cypher
