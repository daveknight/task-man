import SwiftUI
import SwiftData

struct TaskEditorView: View {
    @Bindable var task: TaskItem
    let onDismiss: () -> Void

    @State private var viewModel = TaskEditorViewModel()

    var body: some View {
        VStack(spacing: 0) {
            // Top bar
            editorHeader

            Divider()

            // Scrollable content
            ScrollView {
                VStack(alignment: .leading, spacing: AppConstants.Spacing.xl) {
                    // Title
                    TextField("Task title", text: $task.title)
                        .font(.title2.weight(.semibold))
                        .textFieldStyle(.plain)

                    // Dates row
                    HStack(spacing: AppConstants.Spacing.xl) {
                        DatePickerField(label: "Start Date", date: $task.startDate)
                        DatePickerField(label: "Due Date", date: $task.dueDate)
                        Spacer()
                    }

                    // Date range warning
                    if let warning = viewModel.dateRangeWarning(
                        startDate: task.startDate,
                        dueDate: task.dueDate
                    ) {
                        Label(warning, systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }

                    // Completion toggle
                    Toggle(isOn: $task.isCompleted) {
                        Label("Completed", systemImage: task.isCompleted ? "checkmark.circle.fill" : "circle")
                    }
                    .toggleStyle(.switch)
                    .onChange(of: task.isCompleted) {
                        task.completedAt = task.isCompleted ? Date() : nil
                    }

                    // Tags
                    TagSelectorView(selectedTags: Binding(
                        get: { task.tags ?? [] },
                        set: { task.tags = $0 }
                    ))

                    Divider()

                    // Markdown editor
                    MarkdownEditorView(
                        text: $task.descriptionMarkdown,
                        showPreview: $viewModel.showMarkdownPreview
                    )
                }
                .padding(AppConstants.Spacing.xl)
            }
        }
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: AppConstants.CornerRadius.lg))
        .shadow(color: .black.opacity(0.2), radius: 20, y: 8)
        .padding(AppConstants.Spacing.xl)
        .onDisappear {
            viewModel.save(task: task)
        }
    }

    private var editorHeader: some View {
        HStack {
            Button(action: onDismiss) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.escape, modifiers: [])

            Spacer()

            Text("Edit Task")
                .font(.headline)
                .foregroundStyle(.secondary)

            Spacer()

            // Balance the close button width
            Color.clear.frame(width: 28, height: 28)
        }
        .padding(AppConstants.Spacing.lg)
    }
}

#Preview {
    let task = TaskItem(
        title: "Sample Task",
        descriptionMarkdown: "This is **bold** and _italic_.\n\n- Bullet one\n- Bullet two",
        sortOrder: 0
    )
    TaskEditorView(task: task, onDismiss: {})
        .modelContainer(PersistenceController.preview.container)
        .frame(width: 600, height: 700)
}
