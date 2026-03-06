from marimo._plugins.core.cell_plugin import (
    CellPlugin,
    CellPluginRegistry,
    register_cell_plugin,
    get_plugin_registry
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
    plugin = CellPlugin(name="global_test", js_bundle_paths=["/global.js"], css_bundle_paths=["/global.css"])
    register_cell_plugin(plugin)
    
    registry = get_plugin_registry()
    assert registry.get_plugin("global_test") == plugin
    # Test property access
    assert registry.get_plugin("global_test").css_bundle_paths == ["/global.css"]
