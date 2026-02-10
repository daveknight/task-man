import Testing
import SwiftUI
@testable import TaskMan

@Suite("PresetColor Tests")
struct PresetColorTests {

    @Test("Has exactly 8 cases")
    func testCaseCount() {
        #expect(PresetColor.allCases.count == 8)
    }

    @Test("All raw values are unique")
    func testUniqueRawValues() {
        let rawValues = PresetColor.allCases.map(\.rawValue)
        let uniqueValues = Set(rawValues)
        #expect(rawValues.count == uniqueValues.count)
    }

    @Test("Raw value round-trip succeeds for all cases")
    func testRawValueRoundTrip() {
        for color in PresetColor.allCases {
            let restored = PresetColor(rawValue: color.rawValue)
            #expect(restored == color)
        }
    }

    @Test("Display names are capitalized")
    func testDisplayNames() {
        for color in PresetColor.allCases {
            #expect(color.displayName == color.rawValue.capitalized)
        }
    }

    @Test("Grey is the first case (default)")
    func testGreyIsFirst() {
        #expect(PresetColor.allCases.first == .grey)
    }

    @Test("All expected colors are present")
    func testExpectedColors() {
        let expectedNames: Set<String> = [
            "grey", "rose", "peach", "lemon", "mint", "sky", "lavender", "lilac"
        ]
        let actualNames = Set(PresetColor.allCases.map(\.rawValue))
        #expect(actualNames == expectedNames)
    }
}
