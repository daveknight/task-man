import SwiftUI
import SwiftData

struct TaskListView: View {
    @Query(sort: \TaskItem.sortOrder) private var allTasks: [TaskItem]
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = TaskListViewModel()

    private var visibleTasks: [TaskItem] {
        if viewModel.showCompleted {
            allTasks.filter { $0.sortOrder > -99999 }
        } else {
            allTasks.filter { !$0.isCompleted && $0.sortOrder > -99999 }
        }
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                // Header toolbar
                headerView

                Divider()

                // Task list
                if visibleTasks.isEmpty {
                    emptyStateView
                } else {
                    taskListView
                }

                Divider()

                // Quick-add field
                AddTaskField { title in
                    withAnimation(AppConstants.Animation.standard) {
                        viewModel.addTask(title: title, context: modelContext, existingTasks: allTasks)
                    }
                }
            }

            // Full-screen editor overlay
            if let task = viewModel.editingTask {
                Color.black.opacity(0.3)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(AppConstants.Animation.slow) {
                            viewModel.editingTask = nil
                        }
                    }

                TaskEditorView(task: task) {
                    withAnimation(AppConstants.Animation.slow) {
                        viewModel.editingTask = nil
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Undo toast
            if viewModel.showUndoToast {
                UndoToastView(
                    message: "Task deleted",
                    onUndo: {
                        withAnimation(AppConstants.Animation.standard) {
                            viewModel.undoDelete()
                        }
                    },
                    onDismiss: {
                        viewModel.finalizePendingDeletion(context: modelContext)
                    }
                )
            }
        }
        .sheet(isPresented: $viewModel.showTagManagement) {
            TagManagementView()
        }
    }

    // MARK: - Subviews

    private var headerView: some View {
        HStack(spacing: AppConstants.Spacing.md) {
            Text("Tasks")
                .font(.largeTitle)
                .fontWeight(.bold)

            Spacer()

            CompletedTasksToggle(showCompleted: $viewModel.showCompleted)

            Button {
                viewModel.showTagManagement = true
            } label: {
                Image(systemName: "tag")
                    .font(.title3)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .help("Manage tags")

            Button {
                addNewTask()
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.title2)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.blue)
            .help("Add new task (⌘N)")
            .keyboardShortcut("n", modifiers: .command)
        }
        .padding(.horizontal, AppConstants.Spacing.xl)
        .padding(.vertical, AppConstants.Spacing.lg)
    }

    private var emptyStateView: some View {
        VStack(spacing: AppConstants.Spacing.md) {
            Spacer()
            Image(systemName: "checkmark.circle")
                .font(.system(size: 48))
                .foregroundStyle(.tertiary)
            Text("No tasks yet")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text("Add a task below to get started")
                .font(.callout)
                .foregroundStyle(.tertiary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var taskListView: some View {
        List {
            ForEach(visibleTasks) { task in
                TaskRowView(
                    task: task,
                    onTap: {
                        withAnimation(AppConstants.Animation.slow) {
                            viewModel.editingTask = task
                        }
                    },
                    onComplete: {
                        withAnimation(AppConstants.Animation.slow) {
                            viewModel.toggleCompletion(task)
                        }
                    },
                    onDelete: {
                        withAnimation(AppConstants.Animation.standard) {
                            viewModel.deleteTask(task, context: modelContext)
                        }
                    }
                )
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(
                    top: AppConstants.Spacing.xs,
                    leading: AppConstants.Spacing.lg,
                    bottom: AppConstants.Spacing.xs,
                    trailing: AppConstants.Spacing.lg
                ))
            }
            .onMove { source, destination in
                viewModel.reorder(from: source, to: destination, tasks: visibleTasks)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    // MARK: - Actions

    private func addNewTask() {
        let maxSortOrder = allTasks.map(\.sortOrder).max() ?? -1.0
        let task = TaskItem(title: "", sortOrder: maxSortOrder + 1.0)
        modelContext.insert(task)
        withAnimation(AppConstants.Animation.slow) {
            viewModel.editingTask = task
        }
    }
}

#Preview {
    TaskListView()
        .modelContainer(PersistenceController.preview.container)
}
