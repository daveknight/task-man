import SwiftUI
import MarkdownUI

struct MarkdownPreviewView: View {
    let markdown: String

    var body: some View {
        ScrollView {
            if markdown.isEmpty {
                Text("Nothing to preview")
                    .font(.callout)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, AppConstants.Spacing.xl)
            } else {
                Markdown(markdown)
                    .markdownTheme(.gitHub)
                    .padding(AppConstants.Spacing.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(Color.primary.opacity(0.02))
        .clipShape(RoundedRectangle(cornerRadius: AppConstants.CornerRadius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: AppConstants.CornerRadius.sm)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
        )
    }
}

#Preview {
    MarkdownPreviewView(markdown: """
    # Heading

    This is **bold**, _italic_, and __underline__.

    - Bullet one
    - Bullet two
    - Bullet three

    [A link](https://example.com)
    """)
    .padding()
    .frame(width: 400, height: 300)
}
