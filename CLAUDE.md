# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TaskMan is a macOS 15+ task manager app built with SwiftUI and SwiftData. It targets macOS 15.0, uses Swift 6.0 (strict concurrency), and is structured as an Xcode project generated via XcodeGen from `project.yml`. Tasks are stored in a local SQLite database (no iCloud/CloudKit); users can point the save folder to Dropbox or Google Drive for sync.

## Build & Test Commands

**Regenerate the Xcode project after editing `project.yml`:**
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodegen generate
```

**Build from command line:**
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project TaskMan.xcodeproj -scheme TaskMan -destination 'platform=macOS' build
```

**Run all tests:**
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project TaskMan.xcodeproj -scheme TaskMan -destination 'platform=macOS' test
```

**Run a single test class:**
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project TaskMan.xcodeproj -scheme TaskMan -destination 'platform=macOS' test -only-testing:TaskManTests/TaskListViewModelTests
```

> Note: `xcode-select` may point to CommandLineTools; always prefix with `DEVELOPER_DIR=...` to use the full Xcode toolchain.

## Architecture

The app follows MVVM with three layers:

**Models** (`TaskMan/Models/`) — SwiftData `@Model` classes:
- `TaskItem` — core entity with title, markdown description, dates, completion state, and `sortOrder: Double` for drag reordering
- `Tag` — color-tagged label with a many-to-many relationship to `TaskItem` (inverse: `Tag.tasks ↔ TaskItem.tags`)
- `PresetColor` — enum of named colors used by tags

**Services** (`TaskMan/Services/`):
- `PersistenceController` — singleton that configures the SwiftData `ModelContainer` with a local SQLite store URL. `PersistenceController.shared` calls `StorageSettings.resolvedStoreURL` at initialization. Provides an in-memory `preview` variant for SwiftUI previews and tests.
- `StorageSettings` — `@Observable` class that manages the user-chosen save folder path (stored as a plain path string in `UserDefaults` key `customStoreFolder`). Provides `selectFolder()` (via `NSOpenPanel`) and copies the existing SQLite store + WAL/SHM sidecar files to the new location. Exposes `pendingRestart` to prompt the user to relaunch after changing the location.

**ViewModels** (`TaskMan/ViewModels/`) — `@Observable` classes:
- `TaskListViewModel` — manages task CRUD, drag reordering (via `sortOrder`), and soft-delete with undo (4-second toast timer before finalizing `context.delete`)
- `TaskEditorViewModel` — manages markdown preview toggle and date validation
- `TagManagementViewModel` — manages tag CRUD

**Views** (`TaskMan/Views/`) organized by feature: `TaskList/`, `TaskEditor/`, `Tags/`, `Settings/`, `Common/`.

**App constants** (`AppConstants.swift`) — centralized spacing, corner radius, and animation values. Use these instead of raw literals.

## Key Patterns

- **Swift 6 strict concurrency**: All `@Model` and `@Observable` classes must be `Sendable`-compatible. Use `@MainActor` where needed.
- **Soft delete with undo**: `deleteTask` hides a task by setting `sortOrder = -99999` and starts a timer; `undoDelete` restores it; `finalizePendingDeletion` calls `context.delete`.
- **No app sandbox**: Entitlements are empty — the sandbox was removed because it requires an Apple Developer account for security-scoped bookmarks. `NSOpenPanel` and direct file access work without restriction.
- **Store path resolution order**: `StorageSettings.resolvedStoreURL` (static) → checks `UserDefaults["customStoreFolder"]` → falls back to `~/Library/Application Support/TaskMan/TaskMan.store`. This static property is called by `PersistenceController.shared` before any `StorageSettings` instance is created.
- **In-memory containers for tests**: Use `TestHelpers.makeTestContainer()`. Tests use `@testable import TaskMan`, which causes `Tag` to conflict with `Testing.Tag` — always use the fully qualified `TaskMan.Tag` in `FetchDescriptor` contexts.
- **XcodeGen**: The `.xcodeproj` is generated from `project.yml`. Make structural changes (new targets, packages, settings) there, not directly in the `.pbxproj`.
- **MarkdownUI**: Task descriptions use the `MarkdownUI` package (`swift-markdown-ui`) for rendering markdown in `MarkdownPreviewView`.
- **Settings scene**: Accessible via Cmd+, — implemented as a SwiftUI `Settings` scene in `TaskManApp`. `StorageSettings` is passed via `.environment()` to both the main `WindowGroup` and the `Settings` scene.
