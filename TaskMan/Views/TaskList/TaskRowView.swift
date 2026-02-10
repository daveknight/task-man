import SwiftUI
import SwiftData

struct TaskRowView: View {
    @Bindable var task: TaskItem
    let onTap: () -> Void
    let onComplete: () -> Void
    let onDelete: () -> Void

    @State private var isHovering: Bool = false
    @FocusState private var isTitleFocused: Bool

    var body: some View {
        HStack(spacing: AppConstants.Spacing.md) {
            // Drag handle
            Image(systemName: "line.3.horizontal")
                .font(.caption)
                .foregroundStyle(.quaternary)
                .frame(width: 16)

            // Completion toggle
            Button(action: onComplete) {
                Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(task.isCompleted ? .green : .secondary)
            }
            .buttonStyle(.plain)

            // Inline title editing
            TextField("Task title", text: $task.title)
                .textFieldStyle(.plain)
                .font(.body)
                .focused($isTitleFocused)
                .strikethrough(task.isCompleted, color: .secondary)
                .foregroundStyle(task.isCompleted ? .secondary : .primary)
                .onChange(of: task.title) {
                    task.updatedAt = Date()
                }

            // Tag chips
            if let tags = task.tags, !tags.isEmpty {
                HStack(spacing: AppConstants.Spacing.xs) {
                    ForEach(tags) { tag in
                        TagChipView(tag: tag, compact: true)
                    }
                }
            }

            Spacer()

            // Due date indicator
            if let dueDate = task.dueDate {
                dueDateLabel(dueDate)
            }

            // Delete button (visible on hover)
            if isHovering {
                Button(action: onDelete) {
                    Image(systemName: "trash")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .transition(.opacity)
            }
        }
        .padding(.vertical, AppConstants.Spacing.sm)
        .padding(.horizontal, AppConstants.Spacing.sm)
        .background(
            RoundedRectangle(cornerRadius: AppConstants.CornerRadius.sm)
                .fill(isHovering ? Color.primary.opacity(0.03) : .clear)
        )
        .contentShape(Rectangle())
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovering = hovering
            }
        }
        .onTapGesture {
            if !isTitleFocused {
                onTap()
            }
        }
    }

    private func dueDateLabel(_ date: Date) -> some View {
        let isOverdue = date < Date() && !task.isCompleted
        return Text(date, style: .date)
            .font(.caption)
            .foregroundStyle(isOverdue ? .red : .secondary)
    }
}

#Preview {
    let task = TaskItem(title: "Buy groceries", sortOrder: 0)
    TaskRowView(task: task, onTap: {}, onComplete: {}, onDelete: {})
        .modelContainer(PersistenceController.preview.container)
        .padding()
}
