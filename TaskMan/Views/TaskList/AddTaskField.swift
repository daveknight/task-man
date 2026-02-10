import SwiftUI

struct AddTaskField: View {
    let onAdd: (String) -> Void

    @State private var newTitle: String = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: AppConstants.Spacing.md) {
            Image(systemName: "plus.circle")
                .font(.title3)
                .foregroundStyle(.tertiary)

            TextField("Add a new task...", text: $newTitle)
                .textFieldStyle(.plain)
                .font(.body)
                .focused($isFocused)
                .onSubmit {
                    submitTask()
                }
        }
        .padding(.horizontal, AppConstants.Spacing.xl)
        .padding(.vertical, AppConstants.Spacing.md)
        .background(.bar)
    }

    private func submitTask() {
        let trimmed = newTitle.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        onAdd(trimmed)
        newTitle = ""
    }
}

#Preview {
    AddTaskField { title in
        print("Added: \(title)")
    }
}
