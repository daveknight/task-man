import Testing
import SwiftData
import Foundation
@testable import TaskMan

@Suite("PersistenceController Tests")
struct PersistenceControllerTests {

    @Test("In-memory container initializes without error")
    func testInMemoryInit() {
        let controller = PersistenceController(inMemory: true)
        #expect(controller.container.schema.entities.count > 0)
    }

    @MainActor
    @Test("Preview container has seeded data")
    func testPreviewData() throws {
        let controller = PersistenceController.preview
        let context = controller.container.mainContext

        let taskDescriptor = FetchDescriptor<TaskItem>()
        let tasks = try context.fetch(taskDescriptor)
        #expect(tasks.count == 5)

        let tagDescriptor = FetchDescriptor<TaskMan.Tag>()
        let tags = try context.fetch(tagDescriptor)
        #expect(tags.count == 2)
    }

    @MainActor
    @Test("Preview data includes completed task")
    func testPreviewCompletedTask() throws {
        let controller = PersistenceController.preview
        let context = controller.container.mainContext

        let descriptor = FetchDescriptor<TaskItem>(
            predicate: #Predicate { $0.isCompleted }
        )
        let completedTasks = try context.fetch(descriptor)
        #expect(completedTasks.count >= 1)
    }

    @MainActor
    @Test("Schema includes both TaskItem and Tag entities")
    func testSchemaEntities() {
        let controller = PersistenceController(inMemory: true)
        let entityNames = controller.container.schema.entities.map(\.name)
        #expect(entityNames.contains("TaskItem"))
        #expect(entityNames.contains("Tag"))
    }
}
