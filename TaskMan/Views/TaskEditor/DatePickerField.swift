import SwiftUI

struct DatePickerField: View {
    let label: String
    @Binding var date: Date?

    var body: some View {
        VStack(alignment: .leading, spacing: AppConstants.Spacing.xs) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let existingDate = date {
                HStack(spacing: AppConstants.Spacing.sm) {
                    DatePicker(
                        "",
                        selection: Binding(
                            get: { existingDate },
                            set: { date = $0 }
                        ),
                        displayedComponents: [.date]
                    )
                    .labelsHidden()

                    Button {
                        withAnimation(AppConstants.Animation.standard) {
                            date = nil
                        }
                    } label: {
                        Image(systemName: "xmark.circle")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .help("Clear \(label.lowercased())")
                }
            } else {
                Button {
                    withAnimation(AppConstants.Animation.standard) {
                        date = Date()
                    }
                } label: {
                    Label("Set \(label.lowercased())", systemImage: "calendar.badge.plus")
                        .font(.callout)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.blue)
            }
        }
    }
}

#Preview {
    VStack(spacing: 20) {
        DatePickerField(label: "Start Date", date: .constant(nil))
        DatePickerField(label: "Due Date", date: .constant(Date()))
    }
    .padding()
}
