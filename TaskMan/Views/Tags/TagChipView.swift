import SwiftUI

struct TagChipView: View {
    let tag: Tag
    var compact: Bool = false
    var isSelected: Bool = false
    var onTap: (() -> Void)?

    var body: some View {
        let presetColor = PresetColor(rawValue: tag.colorName) ?? .grey

        Text(tag.name)
            .font(compact ? .caption2 : .caption)
            .fontWeight(isSelected ? .medium : .regular)
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
        TagChipView(tag: tag2, isSelected: true)
        TagChipView(tag: tag3, compact: true)
    }
    .padding()
}
