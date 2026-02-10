import SwiftUI

struct SyncStatusBanner: View {
    let message: String

    var body: some View {
        HStack(spacing: AppConstants.Spacing.sm) {
            Image(systemName: "exclamationmark.icloud")
                .font(.callout)

            Text(message)
                .font(.callout)

            Spacer()
        }
        .padding(.horizontal, AppConstants.Spacing.lg)
        .padding(.vertical, AppConstants.Spacing.md)
        .background(Color.orange.opacity(0.12))
        .foregroundStyle(.orange)
    }
}

#Preview {
    VStack(spacing: 0) {
        SyncStatusBanner(message: "Sign in to iCloud in System Settings to sync your tasks.")
        SyncStatusBanner(message: "No network connection. Changes are saved locally.")
        Spacer()
    }
}
