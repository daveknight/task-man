import SwiftUI

struct ColorPickerGrid: View {
    @Binding var selectedColor: PresetColor

    private let columns = Array(repeating: GridItem(.fixed(36), spacing: 10), count: 4)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(PresetColor.allCases, id: \.self) { preset in
                VStack(spacing: 2) {
                    Circle()
                        .fill(preset.color)
                        .frame(width: 28, height: 28)
                        .overlay(
                            Circle()
                                .strokeBorder(
                                    Color.primary.opacity(selectedColor == preset ? 0.5 : 0),
                                    lineWidth: 2
                                )
                        )
                        .overlay(
                            selectedColor == preset
                                ? Image(systemName: "checkmark")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.primary.opacity(0.6))
                                : nil
                        )
                        .scaleEffect(selectedColor == preset ? 1.1 : 1.0)
                        .animation(AppConstants.Animation.standard, value: selectedColor)

                    Text(preset.displayName)
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                }
                .onTapGesture {
                    selectedColor = preset
                }
            }
        }
    }
}

#Preview {
    ColorPickerGrid(selectedColor: .constant(.sky))
        .padding()
}
