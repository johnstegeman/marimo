# Copyright 2026 Marimo. All rights reserved.
import importlib.metadata
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List

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

    def get_plugin(self, plugin_id: str) -> CellPlugin | None:
        return self._plugins.get(plugin_id)

    def discover_plugins(self) -> None:
        """Discover plugins using python entry_points."""
        # entry_points gives a dictionary-like object in Python 3.10+
        # we can pass group name to get the specific endpoints
        group = "marimo.cell_plugins"

        # for Python 3.10+ compat
        try:
            endpoints = importlib.metadata.entry_points(group=group)
        except TypeError:
            # Python 3.9 compat fallback if needed, though marimo usually requires 3.8+
            endpoints = importlib.metadata.entry_points().get(group, [])  # type: ignore

        for entry_point in endpoints:
            try:
                plugin = entry_point.load()
                if isinstance(plugin, CellPlugin):
                    self.register_plugin(plugin)
            except Exception:
                # Log or handle import errors safely
                pass

    def get_all_plugins(self) -> List[CellPlugin]:
        return list(self._plugins.values())


# Global registry instance
_registry = CellPluginRegistry()


def register_cell_plugin(plugin: CellPlugin) -> None:
    _registry.register_plugin(plugin)


def get_plugin_registry() -> CellPluginRegistry:
    return _registry


def get_plugin_engine_classes() -> List[Any]:
    """Return all engine classes registered by cell plugins."""
    classes: List[Any] = []
    for plugin in _registry.get_all_plugins():
        classes.extend(plugin.engine_classes)
    return classes
