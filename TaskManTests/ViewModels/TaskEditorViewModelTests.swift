import Testing
import Foundation
@testable import TaskMan

@Suite("TaskEditorViewModel Tests")
struct TaskEditorViewModelTests {

    @Test("No date warning when both dates nil")
    func testNoDatesNoWarning() {
        let viewModel = TaskEditorViewModel()
        let warning = viewModel.dateRangeWarning(startDate: nil, dueDate: nil)
        #expect(warning == nil)
    }

    @Test("No date warning when only start date set")
    func testOnlyStartDate() {
        let viewModel = TaskEditorViewModel()
        let warning = viewModel.dateRangeWarning(startDate: Date(), dueDate: nil)
        #expect(warning == nil)
    }

    @Test("No date warning when only due date set")
    func testOnlyDueDate() {
        let viewModel = TaskEditorViewModel()
        let warning = viewModel.dateRangeWarning(startDate: nil, dueDate: Date())
        #expect(warning == nil)
    }

    @Test("No warning when due date is after start date")
    func testValidDateRange() {
        let viewModel = TaskEditorViewModel()
        let start = Date()
        let due = start.addingTimeInterval(86400) // +1 day
        let warning = viewModel.dateRangeWarning(startDate: start, dueDate: due)
        #expect(warning == nil)
    }

    @Test("Warning when due date is before start date")
    func testInvalidDateRange() {
        let viewModel = TaskEditorViewModel()
        let start = Date()
        let due = start.addingTimeInterval(-86400) // -1 day
        let warning = viewModel.dateRangeWarning(startDate: start, dueDate: due)
        #expect(warning != nil)
        #expect(warning?.contains("before") ?? false)
    }

    @Test("Save updates the task timestamp")
    func testSave() {
        let viewModel = TaskEditorViewModel()
        let task = TestHelpers.makeTask(title: "Test")
        let originalUpdatedAt = task.updatedAt

        // Small delay to ensure timestamp differs
        viewModel.save(task: task)
        #expect(task.updatedAt >= originalUpdatedAt)
    }
}
