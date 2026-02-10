import SwiftUI

struct UndoToastView: View {
    let message: String
    let onUndo: () -> Void
    let onDismiss: () -> Void

    @State private var isVisible: Bool = true

    var body: some View {
        VStack {
            Spacer()

            if isVisible {
                HStack(spacing: AppConstants.Spacing.md) {
                    Image(systemName: "trash")
                        .font(.callout)
                        .foregroundStyle(.secondary)

                    Text(message)
                        .font(.callout)

                    Spacer()

                    Button("Undo") {
                        withAnimation(AppConstants.Animation.standard) {
                            isVisible = false
                        }
                        onUndo()
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.blue)
                    .fontWeight(.medium)
                }
                .padding(AppConstants.Spacing.lg)
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: AppConstants.CornerRadius.md))
                .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
                .padding(.horizontal, AppConstants.Spacing.xl)
                .padding(.bottom, AppConstants.Spacing.lg)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + AppConstants.UndoToast.displayDuration) {
                guard isVisible else { return }
                withAnimation(AppConstants.Animation.standard) {
                    isVisible = false
                }
                onDismiss()
            }
        }
    }
}

#Preview {
    ZStack {
        Color.gray.opacity(0.1).ignoresSafeArea()
        UndoToastView(
            message: "Task deleted",
            onUndo: { print("Undo") },
            onDismiss: { print("Dismissed") }
        )
    }
    .frame(width: 500, height: 400)
}
