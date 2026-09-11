// Type shim — @anthropic-ai/sdk is an optional dependency (lazily
// dynamic-imported only when ANTHROPIC_API_KEY is set) and is not
// installed in this environment, so its published types aren't
// available either. Declaring it ambiently keeps the dynamic import
// type-checkable without requiring the package to be present.
declare module "@anthropic-ai/sdk";
