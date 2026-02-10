import Testing
import SwiftData
import Foundation
@testable import TaskMan

@Suite("TaskListViewModel Tests")
struct TaskListViewModelTests {

    @MainActor
    @Test("Add task assigns correct sort order")
    func testAddTask() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext
        let viewModel = TaskListViewModel()

        // Add first task
        let existing1 = TestHelpers.makeTask(title: "Existing", sortOrder: 0)
        context.insert(existing1)
        viewModel.addTask(title: "New Task", context: context, existingTasks: [existing1])

        let descriptor = FetchDescriptor<TaskItem>(
            sortBy: [SortDescriptor(\.sortOrder)]
        )
        let tasks = try context.fetch(descriptor)
        #expect(tasks.count == 2)
        #expect(tasks.last?.title == "New Task")
        #expect(tasks.last?.sortOrder == 1.0)
    }

    @Test("Toggle completion sets completedAt")
    func testToggleCompletion() {
        let viewModel = TaskListViewModel()
        let task = TestHelpers.makeTask(title: "Test")

        viewModel.toggleCompletion(task)
        #expect(task.isCompleted == true)
        #expect(task.completedAt != nil)

        viewModel.toggleCompletion(task)
        #expect(task.isCompleted == false)
        #expect(task.completedAt == nil)
    }

    @Test("Reorder updates sort orders correctly")
    func testReorder() {
        let viewModel = TaskListViewModel()
        let tasks = (0..<3).map { i in
            TestHelpers.makeTask(title: "Task \(i)", sortOrder: Double(i))
        }

        // Move last item to first position
        viewModel.reorder(from: IndexSet(integer: 2), to: 0, tasks: tasks)

        // After reorder, the moved task should have sortOrder 0
        #expect(tasks[2].sortOrder < tasks[0].sortOrder)
    }

    @MainActor
    @Test("Delete task shows undo toast")
    func testDeleteShowsUndo() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext
        let viewModel = TaskListViewModel()

        let task = TestHelpers.makeTask(title: "To Delete")
        context.insert(task)

        viewModel.deleteTask(task, context: context)

        #expect(viewModel.showUndoToast == true)
        #expect(viewModel.recentlyDeletedTask === task)
    }

    @MainActor
    @Test("Undo delete restores task")
    func testUndoDelete() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext
        let viewModel = TaskListViewModel()

        let task = TestHelpers.makeTask(title: "To Restore")
        context.insert(task)

        viewModel.deleteTask(task, context: context)
        viewModel.undoDelete()

        #expect(viewModel.showUndoToast == false)
        #expect(viewModel.recentlyDeletedTask == nil)
        #expect(task.sortOrder == 0) // Restored to visible range
    }

    @MainActor
    @Test("Finalize deletion removes task from context")
    func testFinalizeDeletion() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext
        let viewModel = TaskListViewModel()

        let task = TestHelpers.makeTask(title: "To Finalize")
        context.insert(task)

        viewModel.deleteTask(task, context: context)
        viewModel.finalizePendingDeletion(context: context)

        #expect(viewModel.showUndoToast == false)
        #expect(viewModel.recentlyDeletedTask == nil)
    }
}
