import Foundation
import SwiftData

@Observable
final class TaskEditorViewModel {
    var showMarkdownPreview: Bool = true

    // MARK: - Validation

    var titleWarning: String? {
        nil // Title can be empty during editing, validated on save if needed
    }

    func dateRangeWarning(startDate: Date?, dueDate: Date?) -> String? {
        guard let start = startDate, let due = dueDate else { return nil }
        if due < start {
            return "Due date is before start date"
        }
        return nil
    }

    // MARK: - Save

    func save(task: TaskItem) {
        task.updatedAt = Date()
    }
}
