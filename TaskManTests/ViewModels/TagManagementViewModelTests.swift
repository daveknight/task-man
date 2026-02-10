import Testing
import SwiftData
import Foundation
@testable import TaskMan

@Suite("TagManagementViewModel Tests")
struct TagManagementViewModelTests {

    @MainActor
    @Test("Add tag creates tag in context")
    func testAddTag() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext
        let viewModel = TagManagementViewModel()

        viewModel.newTagName = "  Work  "
        viewModel.addTag(context: context)

        let descriptor = FetchDescriptor<Tag>()
        let tags = try context.fetch(descriptor)
        #expect(tags.count == 1)
        #expect(tags.first?.name == "Work") // Trimmed
        #expect(viewModel.newTagName == "") // Cleared
    }

    @MainActor
    @Test("Add tag with empty name does nothing")
    func testAddEmptyTag() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext
        let viewModel = TagManagementViewModel()

        viewModel.newTagName = "   "
        viewModel.addTag(context: context)

        let descriptor = FetchDescriptor<Tag>()
        let tags = try context.fetch(descriptor)
        #expect(tags.count == 0)
    }

    @MainActor
    @Test("Delete tag removes it from context")
    func testDeleteTag() throws {
        let container = try TestHelpers.makeTestContainer()
        let context = container.mainContext
        let viewModel = TagManagementViewModel()

        let tag = TestHelpers.makeTag(name: "ToDelete")
        context.insert(tag)

        viewModel.deleteTag(tag, context: context)

        let descriptor = FetchDescriptor<Tag>()
        let tags = try context.fetch(descriptor)
        #expect(tags.count == 0)
    }

    @Test("Update tag color changes colorName")
    func testUpdateColor() {
        let viewModel = TagManagementViewModel()
        let tag = TestHelpers.makeTag(name: "Test")
        #expect(tag.colorName == PresetColor.grey.rawValue)

        viewModel.updateTagColor(tag, color: .rose)
        #expect(tag.colorName == PresetColor.rose.rawValue)
    }

    @Test("Update tag name trims whitespace")
    func testUpdateName() {
        let viewModel = TagManagementViewModel()
        let tag = TestHelpers.makeTag(name: "Old")

        viewModel.updateTagName(tag, name: "  New Name  ")
        #expect(tag.name == "New Name")
    }

    @Test("Update tag with empty name does nothing")
    func testUpdateEmptyName() {
        let viewModel = TagManagementViewModel()
        let tag = TestHelpers.makeTag(name: "Keep")

        viewModel.updateTagName(tag, name: "   ")
        #expect(tag.name == "Keep")
    }
}
