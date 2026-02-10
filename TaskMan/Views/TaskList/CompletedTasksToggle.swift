import SwiftUI
import SwiftData

struct CompletedTasksToggle: View {
    @Binding var showCompleted: Bool
    @Query(filter: #Predicate<TaskItem> { $0.isCompleted }) private var completedTasks: [TaskItem]

    var body: some View {
        Button {
            withAnimation(AppConstants.Animation.standard) {
                showCompleted.toggle()
            }
        } label: {
            HStack(spacing: AppConstants.Spacing.xs) {
                Image(systemName: showCompleted ? "eye" : "eye.slash")
                    .font(.callout)
                if completedTasks.count > 0 {
                    Text("\(completedTasks.count)")
                        .font(.caption)
                        .monospacedDigit()
                }
            }
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .help(showCompleted ? "Hide completed tasks" : "Show completed tasks")
    }
}

#Preview {
    CompletedTasksToggle(showCompleted: .constant(false))
        .modelContainer(PersistenceController.preview.container)
}
