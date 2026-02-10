// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "TaskMan",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "TaskManShared", targets: ["TaskManShared"]),
    ],
    dependencies: [
        .package(url: "https://github.com/gonzalezreal/swift-markdown-ui", from: "2.4.0"),
    ],
    targets: [
        .target(
            name: "TaskManShared",
            dependencies: [
                .product(name: "MarkdownUI", package: "swift-markdown-ui"),
            ],
            path: "Shared"
        ),
    ]
)
