// Custom entry: register the mobile Platform adapter BEFORE expo-router
// starts loading route modules. expo-router calls `loadRoute()` for every
// layout during route-tree construction, which evaluates those modules'
// top-level imports (including @trace/client-core consumers). If
// `setPlatform()` hasn't run by then, any client-core API call throws.
import "./src/lib/platform-mobile";
import "expo-router/entry";
