import Foundation
import SwiftData

@Model
final class TaskItem {
    var title: String = ""
    var descriptionMarkdown: String = ""
    var startDate: Date?
    var dueDate: Date?
    var isCompleted: Bool = false
    var completedAt: Date?
    var sortOrder: Double = 0.0
    var createdAt: Date = Date()
    var updatedAt: Date = Date()

    @Relationship(inverse: \Tag.tasks)
    var tags: [Tag]? = []

    init(
        title: String = "",
        descriptionMarkdown: String = "",
        startDate: Date? = nil,
        dueDate: Date? = nil,
        isCompleted: Bool = false,
        sortOrder: Double = 0.0
    ) {
        self.title = title
        self.descriptionMarkdown = descriptionMarkdown
        self.startDate = startDate
        self.dueDate = dueDate
        self.isCompleted = isCompleted
        self.sortOrder = sortOrder
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
