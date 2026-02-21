import SwiftUI

struct ContentView: View {
    var body: some View {
        TaskListView()
            .frame(minWidth: 560, minHeight: 480)
    }
}

#Preview {
    ContentView()
        .modelContainer(PersistenceController.preview.container)
}
