import Foundation
import SwiftData

@Model
final class Tag {
    var name: String = ""
    var colorName: String = PresetColor.grey.rawValue
    var createdAt: Date = Date()

    var tasks: [TaskItem]? = []

    init(name: String = "", colorName: String = PresetColor.grey.rawValue) {
        self.name = name
        self.colorName = colorName
        self.createdAt = Date()
    }
}
