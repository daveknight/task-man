import SwiftData
import Foundation
@testable import TaskMan

enum TestHelpers {

    /// Creates an in-memory ModelContainer for testing.
    @MainActor
    static func makeTestContainer() throws -> ModelContainer {
        let schema = Schema([TaskItem.self, Tag.self])
        let configuration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: true
        )
        return try ModelContainer(for: schema, configurations: [configuration])
    }

    /// Creates a TaskItem with convenient defaults for testing.
    static func makeTask(
        title: String = "Test Task",
        description: String = "",
        startDate: Date? = nil,
        dueDate: Date? = nil,
        isCompleted: Bool = false,
        sortOrder: Double = 0.0
    ) -> TaskItem {
        TaskItem(
            title: title,
            descriptionMarkdown: description,
            startDate: startDate,
            dueDate: dueDate,
            isCompleted: isCompleted,
            sortOrder: sortOrder
        )
    }

    /// Creates a Tag with convenient defaults for testing.
    static func makeTag(
        name: String = "Test Tag",
        colorName: String = PresetColor.grey.rawValue
    ) -> Tag {
        Tag(name: name, colorName: colorName)
    }
}
