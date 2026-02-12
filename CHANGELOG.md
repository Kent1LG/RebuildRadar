# Changelog — RebuildRadar

## [Unreleased]

### Added
- Git-based C++ rebuild impact analysis — uses `git fetch`, `git log`, and `git diff-tree` to detect incoming changes and estimate rebuild scope via `#include` dependency graph.
- Iterative BFS dependency scanner with symlink-cycle detection and 500 k directory safety valve.
- Visual Studio project file support (`.sln` / `.vcxproj`) for accurate build-scope percentages.
- Module / library detection with four strategies: `vcxproj`, `*.Build.cs`, CMake, and directory-based fallback.
- Activity-bar tree view with configuration node, summary, module section, commits, and file lists.
- Webview HTML report with per-commit breakdown and module badges.
- Explorer context menus: Include / Exclude folders (submenu), Set as Project File for `.sln`/`.vcxproj`.
- Graph caching via `globalState` with per-file mtime incremental rebuild.
- Auto-scan on startup with configurable toggle.
- Loading spinner UI during analysis.
- Concurrency guard preventing overlapping analysis runs.
- Five user-facing settings: `projectFile`, `autoScan`, `includePaths`, `excludePaths`, `moduleDetection` (under `rebuildRadar.*`).
