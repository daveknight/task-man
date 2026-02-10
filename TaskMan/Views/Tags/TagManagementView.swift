import SwiftUI
import SwiftData

struct TagManagementView: View {
    @Query(sort: \Tag.name) private var tags: [Tag]
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = TagManagementViewModel()

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Manage Tags")
                    .font(.headline)
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.escape, modifiers: [])
            }
            .padding(AppConstants.Spacing.lg)

            Divider()

            // Tag list
            List {
                ForEach(tags) { tag in
                    HStack(spacing: AppConstants.Spacing.md) {
                        TagChipView(tag: tag)

                        Spacer()

                        // Task count
                        let count = tag.tasks?.count ?? 0
                        if count > 0 {
                            Text("\(count) task\(count == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }

                        Button {
                            viewModel.editingTag = tag
                        } label: {
                            Image(systemName: "pencil")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)

                        Button {
                            withAnimation(AppConstants.Animation.standard) {
                                viewModel.deleteTag(tag, context: modelContext)
                            }
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(.red.opacity(0.7))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.vertical, AppConstants.Spacing.xs)
                }

                // Add new tag row
                HStack(spacing: AppConstants.Spacing.sm) {
                    TextField("New tag name", text: $viewModel.newTagName)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit {
                            viewModel.addTag(context: modelContext)
                        }

                    Button("Add") {
                        viewModel.addTag(context: modelContext)
                    }
                    .disabled(viewModel.newTagName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(.vertical, AppConstants.Spacing.xs)
            }
            .listStyle(.plain)
        }
        .frame(width: 420, height: 480)
        .sheet(item: $viewModel.editingTag) { tag in
            TagEditSheet(tag: tag)
        }
    }
}

#Preview {
    TagManagementView()
        .modelContainer(PersistenceController.preview.container)
}
