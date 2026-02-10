import SwiftUI

struct MarkdownEditorView: View {
    @Binding var text: String
    @Binding var showPreview: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: AppConstants.Spacing.sm) {
            // Header with preview toggle
            HStack {
                Text("Description")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Toggle(isOn: $showPreview) {
                    Label("Preview", systemImage: "eye")
                        .font(.caption)
                }
                .toggleStyle(.button)
                .controlSize(.small)
            }

            if showPreview {
                // Split view: editor + preview
                HSplitView {
                    editorPane
                        .frame(minWidth: 200)

                    MarkdownPreviewView(markdown: text)
                        .frame(minWidth: 200)
                }
                .frame(minHeight: 250)
            } else {
                // Editor only
                editorPane
                    .frame(minHeight: 300)
            }
        }
    }

    private var editorPane: some View {
        TextEditor(text: $text)
            .font(.body.monospaced())
            .scrollContentBackground(.hidden)
            .padding(AppConstants.Spacing.sm)
            .background(Color.primary.opacity(0.03))
            .clipShape(RoundedRectangle(cornerRadius: AppConstants.CornerRadius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: AppConstants.CornerRadius.sm)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            )
    }
}

#Preview {
    MarkdownEditorView(
        text: .constant("# Hello\n\nThis is **bold** and _italic_.\n\n- Item 1\n- Item 2\n\n[Link](https://example.com)"),
        showPreview: .constant(true)
    )
    .padding()
    .frame(width: 600, height: 400)
}
