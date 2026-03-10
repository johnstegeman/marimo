# Copyright 2026 Marimo. All rights reserved.
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List

from marimo import _loggers
from marimo._entrypoints.ids import KnownEntryPoint
from marimo._entrypoints.registry import EntryPointRegistry

LOGGER = _loggers.marimo_logger()


@dataclass
class CellPlugin:
    name: str  # The name of the plugin, e.g. "cypher"
    # The paths to the javascript bundles that should be loaded by the frontend
    js_bundle_paths: List[str] = field(default_factory=list)
    css_bundle_paths: List[str] = field(default_factory=list)
    # Engine classes that implement marimo's BaseEngine interface.
    # When provided, marimo will detect these engine types in the user's
    # variables and register them as data source connections.
    engine_classes: List[Any] = field(default_factory=list)

    @property
    def id(self) -> str:
        """Returns a URL-friendly valid ID for the plugin."""
        return re.sub(r"[^a-zA-Z0-9_-]", "-", self.name).lower()


class CellPluginRegistry:
    def __init__(self) -> None:
        self._plugins: Dict[str, CellPlugin] = {}

    def register_plugin(self, plugin: CellPlugin) -> None:
        self._plugins[plugin.id] = plugin

    def unregister_plugin(self, plugin_id: str) -> CellPlugin | None:
        """Remove a plugin by id. Returns the removed plugin or None."""
        return self._plugins.pop(plugin_id, None)

    def get_plugin(self, plugin_id: str) -> CellPlugin | None:
        return self._plugins.get(plugin_id)

    def discover_plugins(self) -> None:
        """Discover plugins using python entry_points.

        Respects MARIMO_CELL_PLUGINS_ALLOWLIST and MARIMO_CELL_PLUGINS_DENYLIST
        environment variables (entry point names, comma-separated).
        """
        ep_registry: EntryPointRegistry[CellPlugin] = EntryPointRegistry(
            "marimo.cell_plugins"
        )
        for name in ep_registry.names():
            try:
                plugin = ep_registry.get(name)
                if isinstance(plugin, CellPlugin):
                    self.register_plugin(plugin)
            except (KeyError, ValueError):
                pass
            except Exception as e:
                LOGGER.warning(
                    "Failed to load cell plugin %s: %s", name, e, exc_info=False
                )

    def get_all_plugins(self) -> List[CellPlugin]:
        return list(self._plugins.values())


# Global registry instance
_registry = CellPluginRegistry()


def register_cell_plugin(plugin: CellPlugin) -> None:
    _registry.register_plugin(plugin)


def unregister_cell_plugin(plugin_id: str) -> CellPlugin | None:
    """Remove a plugin by id. Returns the removed plugin or None."""
    return _registry.unregister_plugin(plugin_id)


def get_plugin_registry() -> CellPluginRegistry:
    return _registry


def get_plugin_engine_classes() -> List[Any]:
    """Return all engine classes registered by cell plugins."""
    classes: List[Any] = []
    for plugin in _registry.get_all_plugins():
        classes.extend(plugin.engine_classes)
    return classes
