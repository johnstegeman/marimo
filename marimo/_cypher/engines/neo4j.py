# Copyright 2026 Marimo. All rights reserved.
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from marimo import _loggers
from marimo._dependencies.dependencies import DependencyManager
from marimo._sql.engines.types import QueryEngine
from marimo._sql.utils import convert_to_output
from marimo._types.ids import VariableName

LOGGER = _loggers.marimo_logger()

if TYPE_CHECKING:
    import neo4j


class Neo4jEngine(QueryEngine["neo4j.Driver | neo4j.Session"]):
    """Neo4j Cypher query engine."""

    def __init__(
        self,
        connection: neo4j.Driver | neo4j.Session,
        engine_name: Optional[VariableName] = None,
    ) -> None:
        super().__init__(connection, engine_name)

    @property
    def source(self) -> str:
        return "neo4j"

    @property
    def dialect(self) -> str:
        return "cypher"

    @staticmethod
    def is_compatible(var: Any) -> bool:
        if not DependencyManager.neo4j.imported():
            return False

        import neo4j

        return isinstance(var, (neo4j.Driver, neo4j.Session))

    def execute(self, query: str) -> Any:
        DependencyManager.neo4j.require("to execute Cypher queries")
        import neo4j

        connection = self._connection
        if isinstance(connection, neo4j.Driver):
            records, _, keys = connection.execute_query(query)
        elif isinstance(connection, neo4j.Session):
            result = connection.run(query)
            keys = result.keys()
            records = list(result)
        else:
            raise TypeError(
                f"Unsupported Neo4j connection type: {type(connection)}"
            )

        rows = [dict(zip(keys, record.values())) for record in records]

        sql_output_format = self.sql_output_format()

        return convert_to_output(
            sql_output_format=sql_output_format,
            to_polars=lambda: _to_polars(rows),
            to_pandas=lambda: _to_pandas(rows),
            to_native=lambda: rows,
        )

    def execute_raw(self, query: str) -> Any:
        """Execute a query and return the raw neo4j result for graph visualization."""
        DependencyManager.neo4j.require("to execute Cypher queries")
        import neo4j

        connection = self._connection
        if isinstance(connection, neo4j.Driver):
            # execute_query returns EagerResult, but from_neo4j needs neo4j.Result
            session = connection.session()
            return session.run(query)
        elif isinstance(connection, neo4j.Session):
            return connection.run(query)
        else:
            raise TypeError(
                f"Unsupported Neo4j connection type: {type(connection)}"
            )


def _to_polars(rows: list[dict[str, Any]]) -> Any:
    import polars as pl

    return pl.DataFrame(rows)


def _to_pandas(rows: list[dict[str, Any]]) -> Any:
    import pandas as pd

    return pd.DataFrame(rows)
