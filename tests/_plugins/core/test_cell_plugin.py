import os
from unittest.mock import MagicMock, patch

from marimo._plugins.core.cell_plugin import (
    CellPlugin,
    CellPluginRegistry,
    get_plugin_registry,
    register_cell_plugin,
    unregister_cell_plugin,
)


def test_registry_registration():
    registry = CellPluginRegistry()
    plugin = CellPlugin(name="test_plugin", js_bundle_paths=["/test.js"], css_bundle_paths=[])
    
    # Check ID generation
    assert plugin.id == "test_plugin"
    
    # Check plugin register
    registry.register_plugin(plugin)
    assert registry.get_plugin("test_plugin") == plugin
    assert len(registry.get_all_plugins()) == 1

def test_global_registry():
    """Test global registry registration; unregisters after to avoid polluting other tests."""
    registry = get_plugin_registry()
    plugin = CellPlugin(
        name="global_test",
        js_bundle_paths=["/global.js"],
        css_bundle_paths=["/global.css"],
    )
    try:
        register_cell_plugin(plugin)
        assert registry.get_plugin("global_test") == plugin
        assert registry.get_plugin("global_test").css_bundle_paths == ["/global.css"]
    finally:
        unregister_cell_plugin("global_test")


def test_discover_plugins_respects_allowlist():
    """Allowlist restricts which entry points are loaded."""
    registry = CellPluginRegistry()
    plug_a = CellPlugin(name="plug_a", js_bundle_paths=[])
    plug_b = CellPlugin(name="plug_b", js_bundle_paths=[])

    ep_a = MagicMock()
    ep_a.name = "plug_a"
    ep_a.load.return_value = plug_a
    ep_b = MagicMock()
    ep_b.name = "plug_b"
    ep_b.load.return_value = plug_b

    with patch(
        "marimo._entrypoints.registry.get_entry_points"
    ) as mock_get_entry_points:
        mock_get_entry_points.return_value = [ep_a, ep_b]
        with patch.dict(
            os.environ, {"MARIMO_CELL_PLUGINS_ALLOWLIST": "plug_a"}
        ):
            registry.discover_plugins()

    assert registry.get_plugin("plug_a") == plug_a
    assert registry.get_plugin("plug_b") is None
    assert len(registry.get_all_plugins()) == 1


def test_discover_plugins_respects_denylist():
    """Denylist excludes entry points from being loaded."""
    registry = CellPluginRegistry()
    plug_a = CellPlugin(name="plug_a", js_bundle_paths=[])
    plug_b = CellPlugin(name="plug_b", js_bundle_paths=[])

    ep_a = MagicMock()
    ep_a.name = "plug_a"
    ep_a.load.return_value = plug_a
    ep_b = MagicMock()
    ep_b.name = "plug_b"
    ep_b.load.return_value = plug_b

    with patch(
        "marimo._entrypoints.registry.get_entry_points"
    ) as mock_get_entry_points:
        mock_get_entry_points.return_value = [ep_a, ep_b]
        with patch.dict(
            os.environ, {"MARIMO_CELL_PLUGINS_DENYLIST": "plug_b"}
        ):
            registry.discover_plugins()

    assert registry.get_plugin("plug_a") == plug_a
    assert registry.get_plugin("plug_b") is None
    assert len(registry.get_all_plugins()) == 1
