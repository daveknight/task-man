import Foundation
import SwiftData

@Observable
final class TagManagementViewModel {
    var editingTag: Tag?
    var newTagName: String = ""

    func addTag(context: ModelContext) {
        let trimmed = newTagName.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }

        let tag = Tag(name: trimmed)
        context.insert(tag)
        newTagName = ""
    }

    func deleteTag(_ tag: Tag, context: ModelContext) {
        // Remove tag from all associated tasks before deleting
        if let tasks = tag.tasks {
            for task in tasks {
                task.tags?.removeAll(where: { $0.id == tag.id })
                task.updatedAt = Date()
            }
        }
        context.delete(tag)
    }

    func updateTagColor(_ tag: Tag, color: PresetColor) {
        tag.colorName = color.rawValue
    }

    func updateTagName(_ tag: Tag, name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        tag.name = trimmed
    }
}
