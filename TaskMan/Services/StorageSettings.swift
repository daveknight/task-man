import Foundation
import AppKit

@Observable
final class StorageSettings {
    static let customFolderKey = "customStoreFolder"
    static let storeName = "TaskMan.store"

    private(set) var customFolderURL: URL?
    private(set) var pendingRestart: Bool = false

    // MARK: - Computed URLs

    /// URL of the active store file.
    var effectiveStoreURL: URL {
        customFolderURL?.appending(path: Self.storeName) ?? Self.defaultStoreURL
    }

    /// Display path of the active save folder (for Settings UI).
    var effectiveFolderDisplayPath: String {
        (customFolderURL ?? Self.defaultStoreURL.deletingLastPathComponent())
            .path(percentEncoded: false)
    }

    /// Default store location inside Application Support.
    static var defaultStoreURL: URL {
        let appSupport = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        )[0]
        let dir = appSupport.appending(path: "TaskMan")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appending(path: storeName)
    }

    /// Reads the saved folder path at app startup and returns the store URL.
    /// Called once during PersistenceController.shared initialization.
    static var resolvedStoreURL: URL {
        if let path = UserDefaults.standard.string(forKey: customFolderKey) {
            return URL(fileURLWithPath: path).appending(path: storeName)
        }
        return defaultStoreURL
    }

    // MARK: - Init

    init() {
        if let path = UserDefaults.standard.string(forKey: Self.customFolderKey) {
            customFolderURL = URL(fileURLWithPath: path)
        }
    }

    // MARK: - Actions

    @MainActor
    func selectFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.message = "Choose a folder where TaskMan will save your tasks.\nPoint to a Dropbox, Google Drive, or iCloud Drive folder to sync across devices."
        panel.prompt = "Select Folder"

        guard panel.runModal() == .OK, let url = panel.url else { return }

        migrateStoreIfNeeded(to: url)

        UserDefaults.standard.set(url.path(percentEncoded: false), forKey: Self.customFolderKey)
        customFolderURL = url
        pendingRestart = true
    }

    func resetToDefault() {
        UserDefaults.standard.removeObject(forKey: Self.customFolderKey)
        customFolderURL = nil
        pendingRestart = true
    }

    // MARK: - Migration

    /// Copies the current store files to the new folder if no store already exists there.
    private func migrateStoreIfNeeded(to newFolder: URL) {
        let currentURL = effectiveStoreURL
        let newURL = newFolder.appending(path: Self.storeName)

        guard FileManager.default.fileExists(atPath: currentURL.path(percentEncoded: false)),
              !FileManager.default.fileExists(atPath: newURL.path(percentEncoded: false))
        else { return }

        try? FileManager.default.copyItem(at: currentURL, to: newURL)

        // Copy SQLite WAL and SHM sidecar files if present
        for suffix in ["-wal", "-shm"] {
            let src = URL(fileURLWithPath: currentURL.path(percentEncoded: false) + suffix)
            let dst = URL(fileURLWithPath: newURL.path(percentEncoded: false) + suffix)
            if FileManager.default.fileExists(atPath: src.path(percentEncoded: false)) {
                try? FileManager.default.copyItem(at: src, to: dst)
            }
        }
    }
}
