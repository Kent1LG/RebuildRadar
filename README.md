# RebuildRadar

A Visual Studio Code extension that uses **git** to analyze incoming commits and estimate how much of your C++ project will need to rebuild. It runs `git fetch` and `git diff-tree` under the hood, parses `#include` dependencies, detects project modules/libraries, and gives you a clear picture of rebuild impact **before** you pull.

> **Note:** This extension is entirely git-based. It requires a git repository and uses remote tracking branches to detect incoming changes — no build system invocation is needed.

## Features

- **Git-powered commit analysis** — fetches remote refs and inspects incoming commits via `git diff-tree` to identify changed C++ files, with no build required.
- **Overall rebuild percentage** — a single number summarizing the total estimated rebuild impact across all incoming commits.
- **Module / library detection** — automatically identifies project modules via `.vcxproj`/`.sln`, `*.Build.cs`, `CMakeLists.txt`, or directory structure.
- **Activity-bar sidebar** — a dedicated tree view showing configuration, summary, modules, commits, and affected files.
- **Detailed HTML report** — a full webview report with per-commit breakdown and module badges.
- **Explorer context menus** — right-click folders to include/exclude from scanning, or right-click `.sln`/`.vcxproj` files to set them as the project file.
- **Caching & auto-scan** — dependency graph is cached and incrementally updated; optionally runs on startup.

## Getting Started

### From Source

```bash
git clone <repository-url>
cd RebuildRadar
npm install
```

Open the folder in VS Code and press **F5** to launch the Extension Development Host.

### From VSIX

```bash
npm run package        # produces a .vsix file
code --install-extension rebuild-radar-*.vsix
```

## Usage

1. Open a git-tracked workspace containing a C++ project.
2. Click the **RebuildRadar** icon in the Activity Bar (or run `RebuildRadar: Analyze` from the command palette).
3. The extension runs `git fetch`, compares remote branches, builds a dependency graph, and shows results in the sidebar.
4. Expand commits to see affected files; expand the **Modules** section to see per-library impact.
5. Click **RebuildRadar: Show Report** in the view title bar for a full HTML report.

## Configuration

All settings live under `rebuildRadar.*` and are also visible in the sidebar's **Configuration** node.

| Setting | Default | Description |
|---------|---------|-------------|
| `rebuildRadar.projectFile` | `""` | Path to a `.sln` or `.vcxproj` file (relative to workspace root). Scopes the build file set for accurate percentages. |
| `rebuildRadar.autoScan` | `true` | Automatically run impact analysis when VS Code starts. |
| `rebuildRadar.includePaths` | `[]` | Directories to scan for C++ files. Empty = entire workspace. |
| `rebuildRadar.excludePaths` | `[]` | Directories to skip during scanning. |
| `rebuildRadar.moduleDetection` | `"auto"` | Module detection strategy: `auto`, `vcxproj`, `unreal`, `cmake`, `directory`, or `none`. |

## How It Works

The entire workflow is built on **git** — no compiler or build system is invoked.

1. **Fetch** — runs `git fetch` to get the latest remote refs.
2. **Diff** — uses `git log` and `git diff-tree` to identify C++ files changed in incoming commits that haven't been merged yet.
3. **Dependency Graph** — iterative BFS scan of the workspace, parsing `#include "..."` directives to build a full reverse-dependency map (pure file-system + regex, no build needed).
4. **Impact Calculation** — for each changed file, walk its reverse-dependency chain to find all files that would need rebuilding.
5. **Module Grouping** — map affected files to their owning module/library and summarize per-module impact.

## Supported Project Types

| Type | Detection | How |
|------|-----------|-----|
| Visual Studio | `.sln` / `.vcxproj` | Set `rebuildRadar.projectFile` to your solution |
| Unreal Engine | `*.Build.cs` | Auto-detected or use `moduleDetection: "unreal"` |
| CMake | `CMakeLists.txt` | Finds `add_library` / `add_executable` targets |
| Generic C++ | Directory structure | Falls back to top-level subdirectories of `Source/` or `src/` |

## Contributing

Contributions are welcome! Fork the repository, create a feature branch, and open a pull request.

## License

MIT — see [LICENSE](LICENSE) for details.
