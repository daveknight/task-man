import Foundation
import SwiftData
import SwiftUI

@Observable
final class TaskListViewModel {
    var showCompleted: Bool = false
    var editingTask: TaskItem?
    var showTagManagement: Bool = false

    // Undo support
    private(set) var recentlyDeletedTask: TaskItem?
    private(set) var showUndoToast: Bool = false
    private var undoTimer: Timer?

    // MARK: - Task Operations

    func addTask(title: String, context: ModelContext, existingTasks: [TaskItem]) {
        let maxSortOrder = existingTasks.map(\.sortOrder).max() ?? -1.0
        let task = TaskItem(
            title: title,
            sortOrder: maxSortOrder + 1.0
        )
        context.insert(task)
    }

    func toggleCompletion(_ task: TaskItem) {
        task.isCompleted.toggle()
        task.completedAt = task.isCompleted ? Date() : nil
        task.updatedAt = Date()
    }

    func deleteTask(_ task: TaskItem, context: ModelContext) {
        // Cancel any pending undo timer and finalize previous deletion
        finalizePendingDeletion(context: context)

        // Soft-delete: hide the task but keep it in context for undo
        recentlyDeletedTask = task
        task.sortOrder = -99999 // Move out of visible range
        showUndoToast = true

        // Auto-finalize after the toast duration
        undoTimer = Timer.scheduledTimer(
            withTimeInterval: AppConstants.UndoToast.displayDuration,
            repeats: false
        ) { [weak self] _ in
            DispatchQueue.main.async {
                self?.finalizePendingDeletion(context: context)
            }
        }
    }

    func undoDelete() {
        guard let task = recentlyDeletedTask else { return }
        undoTimer?.invalidate()
        undoTimer = nil

        // Restore the task to a visible sort position
        task.sortOrder = 0
        task.updatedAt = Date()

        recentlyDeletedTask = nil
        showUndoToast = false
    }

    func finalizePendingDeletion(context: ModelContext) {
        undoTimer?.invalidate()
        undoTimer = nil

        if let task = recentlyDeletedTask {
            context.delete(task)
        }
        recentlyDeletedTask = nil
        showUndoToast = false
    }

    // MARK: - Reordering

    func reorder(from source: IndexSet, to destination: Int, tasks: [TaskItem]) {
        var mutableTasks = tasks
        mutableTasks.move(fromOffsets: source, toOffset: destination)
        for (index, task) in mutableTasks.enumerated() {
            task.sortOrder = Double(index)
            task.updatedAt = Date()
        }
    }
}
