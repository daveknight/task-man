import SwiftUI
import SwiftData

struct TagSelectorView: View {
    @Binding var selectedTags: [Tag]
    @Query(sort: \Tag.name) private var allTags: [Tag]
    @Environment(\.modelContext) private var modelContext

    @State private var newTagName: String = ""
    @State private var showNewTagField: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: AppConstants.Spacing.sm) {
            Text("Tags")
                .font(.caption)
                .foregroundStyle(.secondary)

            FlowLayout(spacing: AppConstants.Spacing.sm) {
                ForEach(allTags) { tag in
                    TagChipView(
                        tag: tag,
                        isSelected: selectedTags.contains(where: { $0.id == tag.id }),
                        onTap: { toggleTag(tag) }
                    )
                }

                // Create new tag button
                Button {
                    showNewTagField = true
                } label: {
                    Label("New", systemImage: "plus")
                        .font(.caption)
                        .padding(.horizontal, AppConstants.Spacing.sm)
                        .padding(.vertical, AppConstants.Spacing.xs)
                        .background(Color.primary.opacity(0.06))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }

            if showNewTagField {
                HStack(spacing: AppConstants.Spacing.sm) {
                    TextField("Tag name", text: $newTagName)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { createTag() }

                    Button("Add") { createTag() }
                        .disabled(newTagName.trimmingCharacters(in: .whitespaces).isEmpty)

                    Button("Cancel") {
                        newTagName = ""
                        showNewTagField = false
                    }
                }
            }
        }
    }

    private func toggleTag(_ tag: Tag) {
        if let index = selectedTags.firstIndex(where: { $0.id == tag.id }) {
            selectedTags.remove(at: index)
        } else {
            selectedTags.append(tag)
        }
    }

    private func createTag() {
        let trimmed = newTagName.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }

        let tag = Tag(name: trimmed)
        modelContext.insert(tag)
        selectedTags.append(tag)

        newTagName = ""
        showNewTagField = false
    }
}

#Preview {
    TagSelectorView(selectedTags: .constant([]))
        .modelContainer(PersistenceController.preview.container)
        .padding()
}
