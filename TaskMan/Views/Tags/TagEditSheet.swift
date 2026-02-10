import SwiftUI

struct TagEditSheet: View {
    @Bindable var tag: Tag
    @Environment(\.dismiss) private var dismiss
    @State private var editedName: String = ""
    @State private var selectedColor: PresetColor = .grey

    var body: some View {
        VStack(spacing: AppConstants.Spacing.xl) {
            // Header
            HStack {
                Text("Edit Tag")
                    .font(.headline)
                Spacer()
                Button("Done") { save() }
                    .keyboardShortcut(.return, modifiers: .command)
            }

            // Name field
            VStack(alignment: .leading, spacing: AppConstants.Spacing.xs) {
                Text("Name")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Tag name", text: $editedName)
                    .textFieldStyle(.roundedBorder)
            }

            // Color picker
            VStack(alignment: .leading, spacing: AppConstants.Spacing.sm) {
                Text("Color")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ColorPickerGrid(selectedColor: $selectedColor)
            }

            // Preview
            VStack(alignment: .leading, spacing: AppConstants.Spacing.xs) {
                Text("Preview")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                let previewTag = Tag(name: editedName.isEmpty ? "Tag" : editedName, colorName: selectedColor.rawValue)
                TagChipView(tag: previewTag)
            }

            Spacer()
        }
        .padding(AppConstants.Spacing.xl)
        .frame(width: 320, height: 300)
        .onAppear {
            editedName = tag.name
            selectedColor = PresetColor(rawValue: tag.colorName) ?? .grey
        }
    }

    private func save() {
        let trimmed = editedName.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty {
            tag.name = trimmed
        }
        tag.colorName = selectedColor.rawValue
        dismiss()
    }
}

#Preview {
    let tag = Tag(name: "Work", colorName: PresetColor.sky.rawValue)
    TagEditSheet(tag: tag)
        .modelContainer(PersistenceController.preview.container)
}
