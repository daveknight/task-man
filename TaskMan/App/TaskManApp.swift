import SwiftUI
import SwiftData

@main
struct TaskManApp: App {
    let persistenceController = PersistenceController.shared
    @State private var syncMonitor = CloudKitSyncMonitor()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(syncMonitor)
        }
        .modelContainer(persistenceController.container)
    }
}
