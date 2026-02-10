import SwiftUI

struct ContentView: View {
    @Environment(CloudKitSyncMonitor.self) private var syncMonitor

    var body: some View {
        VStack(spacing: 0) {
            if syncMonitor.shouldShowBanner {
                SyncStatusBanner(message: syncMonitor.bannerMessage)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            TaskListView()
        }
        .animation(.easeInOut(duration: 0.3), value: syncMonitor.shouldShowBanner)
        .frame(minWidth: 560, minHeight: 480)
    }
}

#Preview {
    ContentView()
        .environment(CloudKitSyncMonitor())
        .modelContainer(PersistenceController.preview.container)
}
