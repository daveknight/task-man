import Testing
import SwiftData
import Foundation
@testable import TaskMan

@Suite("TaskItem Model Tests")
struct TaskItemTests {

    @Test("Default values are correct")
    func testDefaults() {
        let task = TaskItem()
        #expect(task.title == "")
        #expect(task.descriptionMarkdown == "")
        #expect(task.startDate == nil)
        #expect(task.dueDate == nil)
        #expect(task.isCompleted == false)
        #expect(task.completedAt == nil)
        #expect(task.sortOrder == 0.0)
        #expect(task.tags?.isEmpty ?? true)
    }

    @Test("Init with parameters sets values")
    func testInitWithParameters() {
        let start = Date()
        let due = Date().addingTimeInterval(86400)
        let task = TaskItem(
            title: "Buy groceries",
            descriptionMarkdown: "**Important** items",
            startDate: start,
            dueDate: due,
            isCompleted: false,
            sortOrder: 5.0
        )

        #expect(task.title == "Buy groceries")
        #expect(task.descriptionMarkdown == "**Important** items")
        #expect(task.startDate == start)
        #expect(task.dueDate == due)
        #expect(task.isCompleted == false)
        #expect(task.sortOrder == 5.0)
    }

    @Test("Completion toggles completedAt")
    func testCompletionToggle() {
        let task = TaskItem(title: "Test")

        // Complete the task
        task.isCompleted = true
        task.completedAt = Date()
        #expect(task.isCompleted == true)
        #expect(task.completedAt != nil)

        // Uncomplete the task
        task.isCompleted = false
        task.completedAt = nil
        #expect(task.isCompleted == false)
        #expect(task.completedAt == nil)
    }

    @Test("SortOrder supports fractional values for insertion")
    func testFractionalSortOrder() {
        let task1 = TaskItem(title: "First", sortOrder: 1.0)
        let task2 = TaskItem(title: "Third", sortOrder: 2.0)
        let inserted = TaskItem(title: "Between", sortOrder: 1.5)

        let sorted = [task1, task2, inserted].sorted { $0.sortOrder < $1.sortOrder }
        #expect(sorted[0].title == "First")
        #expect(sorted[1].title == "Between")
        #expect(sorted[2].title == "Third")
    }

    @MainActor
    @Test("Persistence: insert and fetch")
    func testPersistence() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext

        let task = TestHelpers.makeTask(title: "Persisted Task", sortOrder: 1.0)
        context.insert(task)

        let descriptor = FetchDescriptor<TaskItem>(
            sortBy: [SortDescriptor(\.sortOrder)]
        )
        let fetched = try context.fetch(descriptor)
        #expect(fetched.count == 1)
        #expect(fetched.first?.title == "Persisted Task")
    }

    @MainActor
    @Test("Tag relationship works bidirectionally")
    func testTagRelationship() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext

        let task = TestHelpers.makeTask(title: "Tagged Task")
        let tag = TestHelpers.makeTag(name: "Work", colorName: PresetColor.sky.rawValue)
        context.insert(task)
        context.insert(tag)
        task.tags = [tag]

        #expect(task.tags?.count == 1)
        #expect(task.tags?.first?.name == "Work")
        #expect(tag.tasks?.contains(where: { $0.title == "Tagged Task" }) ?? false)
    }
}
