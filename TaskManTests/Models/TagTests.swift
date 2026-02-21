import Testing
import SwiftData
import Foundation
@testable import TaskMan

@Suite("Tag Model Tests")
struct TagTests {

    @Test("Default color is grey")
    func testDefaultColor() {
        let tag = Tag()
        #expect(tag.colorName == PresetColor.grey.rawValue)
        #expect(tag.name == "")
    }

    @Test("Init with parameters sets values")
    func testInitWithParameters() {
        let tag = Tag(name: "Urgent", colorName: PresetColor.rose.rawValue)
        #expect(tag.name == "Urgent")
        #expect(tag.colorName == PresetColor.rose.rawValue)
    }

    @Test("Color name round-trips through PresetColor")
    func testColorRoundTrip() {
        for color in PresetColor.allCases {
            let tag = Tag(name: "Test", colorName: color.rawValue)
            let restored = PresetColor(rawValue: tag.colorName)
            #expect(restored == color)
        }
    }

    @MainActor
    @Test("Persistence: insert and fetch")
    func testPersistence() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext

        let tag = TestHelpers.makeTag(name: "Personal", colorName: PresetColor.mint.rawValue)
        context.insert(tag)

        let descriptor = FetchDescriptor<TaskMan.Tag>(sortBy: [SortDescriptor(\TaskMan.Tag.name)])
        let fetched = try context.fetch(descriptor)
        #expect(fetched.count == 1)
        #expect(fetched.first?.name == "Personal")
        #expect(fetched.first?.colorName == PresetColor.mint.rawValue)
    }

    @MainActor
    @Test("Multiple tasks can share a tag")
    func testMultipleTasksShareTag() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext

        let tag = TestHelpers.makeTag(name: "Shared")
        let task1 = TestHelpers.makeTask(title: "Task 1", sortOrder: 0)
        let task2 = TestHelpers.makeTask(title: "Task 2", sortOrder: 1)
        context.insert(tag)
        context.insert(task1)
        context.insert(task2)

        task1.tags = [tag]
        task2.tags = [tag]

        #expect(tag.tasks?.count == 2)
    }
}
