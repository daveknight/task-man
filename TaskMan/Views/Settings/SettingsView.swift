import SwiftUI

struct SettingsView: View {
    @Environment(StorageSettings.self) private var storageSettings

    var body: some View {
        Form {
            Section {
                LabeledContent("Save folder") {
                    HStack(spacing: AppConstants.Spacing.sm) {
                        Text(storageSettings.effectiveFolderDisplayPath)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .frame(maxWidth: 260, alignment: .leading)

                        Button("Choose…") {
                            storageSettings.selectFolder()
                        }
                    }
                }

                if storageSettings.customFolderURL != nil {
                    Button("Reset to Default") {
                        storageSettings.resetToDefault()
                    }
                    .foregroundStyle(.red)
                }

                if storageSettings.pendingRestart {
                    Label(
                        "Restart TaskMan to load tasks from the new location.",
                        systemImage: "arrow.clockwise.circle"
                    )
                    .foregroundStyle(.orange)
                    .font(.callout)
                }
            } header: {
                Text("Storage")
            } footer: {
                Text("Tasks are saved as a local database file (TaskMan.store). To sync across devices, point the save folder to a folder managed by Dropbox, Google Drive, or any other sync service. Your existing tasks will be copied to the new location automatically.")
                    .foregroundStyle(.secondary)
                    .font(.callout)
            }
        }
        .formStyle(.grouped)
        .frame(width: 500)
        .padding(.bottom, AppConstants.Spacing.lg)
    }
}

#Preview {
    SettingsView()
        .environment(StorageSettings())
}
