import SwiftUI

struct TagChipView: View {
    let tag: Tag
    var compact: Bool = false
    var isSelected: Bool = false
    var removable: Bool = false
    var onTap: (() -> Void)?

    @State private var isHovered: Bool = false

    var body: some View {
        let presetColor = PresetColor(rawValue: tag.colorName) ?? .grey

        HStack(spacing: compact ? 3 : 4) {
            Text(tag.name)
                .font(compact ? .caption2 : .caption)
                .fontWeight(isSelected ? .medium : .regular)

            if removable {
                Image(systemName: "xmark")
                    .font(.system(size: compact ? 7 : 8, weight: .bold))
                    .opacity(isHovered ? 1 : 0)
            }
        }
        .padding(.horizontal, compact ? 6 : 10)
        .padding(.vertical, compact ? 2 : 4)
        .background(presetColor.color.opacity(isSelected ? 0.8 : 0.4))
        .foregroundStyle(.primary)
        .clipShape(Capsule())
        .overlay(
            Capsule()
                .strokeBorder(
                    isSelected ? Color.primary.opacity(0.25) : .clear,
                    lineWidth: 1
                )
        )
        .contentShape(Capsule())
        .onHover { isHovered = $0 }
        .onChange(of: removable) { _, newValue in
            if newValue { isHovered = false }
        }
        .animation(AppConstants.Animation.standard, value: isHovered)
        .onTapGesture {
            onTap?()
        }
    }
}

#Preview {
    HStack(spacing: 8) {
        let tag1 = Tag(name: "Work", colorName: PresetColor.sky.rawValue)
        let tag2 = Tag(name: "Personal", colorName: PresetColor.mint.rawValue)
        let tag3 = Tag(name: "Urgent", colorName: PresetColor.rose.rawValue)

        TagChipView(tag: tag1)
        TagChipView(tag: tag2, isSelected: true, removable: true)
        TagChipView(tag: tag3, compact: true)
    }
    .padding()
}
