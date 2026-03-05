# Copyright 2026 Marimo. All rights reserved.
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal, Optional

from marimo._dependencies.dependencies import DependencyManager
from marimo._output.rich_help import mddoc
from marimo._runtime.output import replace

if TYPE_CHECKING:
    import neo4j


@mddoc
def cypher(
    query: str,
    *,
    output: bool = True,
    output_type: Literal["dataframe", "visualization"] = "dataframe",
    engine: Optional[neo4j.Driver | neo4j.Session] = None,
) -> Any:
    """
    Execute a Cypher query against a Neo4j database.

    This requires a Neo4j driver or session to be provided via the `engine`
    argument. You can create one using the official neo4j Python driver:

    ```python
    import neo4j
    driver = neo4j.GraphDatabase.driver("neo4j://localhost:7687", auth=("neo4j", "password"))
    ```

    The result of the query is displayed in the UI if output is True.

    Args:
        query: The Cypher query to execute.
        output: Whether to display the result in the UI. Defaults to True.
        output_type: The type of output to display. Either "dataframe" (default)
            or "visualization" (requires neo4j-viz).
        engine: A neo4j.Driver or neo4j.Session to use for execution. Required.

    Returns:
        When output_type is "dataframe": the result as a DataFrame (polars or
        pandas, depending on your configuration), or a list of dicts if neither
        is available.
        When output_type is "visualization": a VisGraph object from
        neo4j-viz.
    """
    if query is None or query.strip() == "":
        return None

    if engine is None:
        raise ValueError(
            "A Neo4j driver or session is required to execute Cypher queries. "
            "Create one with:\n\n"
            "    import neo4j\n"
            "    driver = neo4j.GraphDatabase.driver(\n"
            '        "neo4j://localhost:7687", auth=("neo4j", "password")\n'
            "    )\n\n"
            "Then pass it as the engine argument: mo.cypher(query, engine=driver)"
        )

    from marimo._cypher.engines.neo4j import Neo4jEngine

    if not Neo4jEngine.is_compatible(engine):
        raise ValueError(
            "Unsupported engine. Must be a neo4j.Driver or neo4j.Session. "
            "Install the neo4j driver with: pip install neo4j"
        )

    neo4j_engine = Neo4jEngine(connection=engine)

    if output_type == "visualization":
        DependencyManager.neo4j_viz.require(
            "to visualize Neo4j graph results"
        )
        from neo4j_viz.neo4j import from_neo4j

        raw_result = neo4j_engine.execute_raw(query)
        vg = from_neo4j(raw_result)

        if output:
            replace(vg.render_widget())

        return vg

    df = neo4j_engine.execute(query)

    if df is None:
        return None

    if output:
        from marimo._output.formatters.df_formatters import include_opinionated
        from marimo._output.formatting import plain
        from marimo._plugins.ui._impl import table

        if not include_opinionated():
            replace(plain(df))
        else:
            replace(
                table.table(
                    df,
                    selection=None,
                    pagination=True,
                )
            )

    return df
