import SwiftUI

enum PresetColor: String, CaseIterable, Codable, Sendable {
    case grey
    case rose
    case peach
    case lemon
    case mint
    case sky
    case lavender
    case lilac

    var color: Color {
        switch self {
        case .grey:     Color(red: 0.78, green: 0.78, blue: 0.80)
        case .rose:     Color(red: 0.96, green: 0.76, blue: 0.76)
        case .peach:    Color(red: 0.98, green: 0.85, blue: 0.73)
        case .lemon:    Color(red: 0.98, green: 0.95, blue: 0.73)
        case .mint:     Color(red: 0.73, green: 0.94, blue: 0.82)
        case .sky:      Color(red: 0.73, green: 0.87, blue: 0.98)
        case .lavender: Color(red: 0.80, green: 0.78, blue: 0.96)
        case .lilac:    Color(red: 0.92, green: 0.78, blue: 0.96)
        }
    }

    var displayName: String {
        rawValue.capitalized
    }
}
