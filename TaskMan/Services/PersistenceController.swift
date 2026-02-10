import SwiftData
import Foundation

struct PersistenceController: Sendable {
    static let shared = PersistenceController()

    let container: ModelContainer

    init(inMemory: Bool = false) {
        let schema = Schema([TaskItem.self, Tag.self])

        let configuration: ModelConfiguration
        if inMemory {
            configuration = ModelConfiguration(
                schema: schema,
                isStoredInMemoryOnly: true
            )
        } else {
            configuration = ModelConfiguration(
                schema: schema,
                isStoredInMemoryOnly: false,
                cloudKitDatabase: .automatic
            )
        }

        do {
            container = try ModelContainer(
                for: schema,
                configurations: [configuration]
            )
        } catch {
            fatalError("Failed to initialize ModelContainer: \(error)")
        }
    }

    @MainActor
    static var preview: PersistenceController {
        let controller = PersistenceController(inMemory: true)
        let context = controller.container.mainContext

        let workTag = Tag(name: "Work", colorName: PresetColor.sky.rawValue)
        let personalTag = Tag(name: "Personal", colorName: PresetColor.mint.rawValue)
        context.insert(workTag)
        context.insert(personalTag)

        for i in 0..<5 {
            let task = TaskItem(
                title: "Sample Task \(i + 1)",
                descriptionMarkdown: "This is a **sample** task with _markdown_ formatting.\n\n- Item one\n- Item two",
                sortOrder: Double(i)
            )
            if i % 2 == 0 {
                task.tags = [workTag]
            } else {
                task.tags = [personalTag]
            }
            if i == 3 {
                task.isCompleted = true
                task.completedAt = Date()
            }
            context.insert(task)
        }

        return controller
    }
}
