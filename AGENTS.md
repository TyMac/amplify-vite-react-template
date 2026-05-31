## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## npm security defaults

Use these project-level npm defaults for dependency installs:

```ini
min-release-age=7
allow-git=root
ignore-scripts=true
```

- `min-release-age=7` avoids packages published within the last 7 days.
- `allow-git=root` only allows git dependencies from the root project, not transitive packages.
- `ignore-scripts=true` blocks dependency lifecycle scripts by default. If a package genuinely requires scripts, make the exception explicit and temporary for that command.
- If you need to bypass any of these npm security protections for any reason, explicitly ask Tyler for permission first.
