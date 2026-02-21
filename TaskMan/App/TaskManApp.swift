import SwiftUI
import SwiftData

@main
struct TaskManApp: App {
    let persistenceController = PersistenceController.shared
    @State private var storageSettings = StorageSettings()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(storageSettings)
        }
        .modelContainer(persistenceController.container)

        Settings {
            SettingsView()
                .environment(storageSettings)
        }
    }
}
