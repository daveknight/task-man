import Foundation
import CloudKit
import Network
import SwiftUI

@Observable
final class CloudKitSyncMonitor {

    enum SyncState: Equatable {
        case idle
        case syncing
        case succeeded
        case failed(String)
        case accountUnavailable(String)
        case networkUnavailable
    }

    private(set) var syncState: SyncState = .idle
    private(set) var iCloudAccountAvailable: Bool = false
    private(set) var networkAvailable: Bool = true

    private let networkMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.taskman.networkMonitor")
    private var notificationObservers: [Any] = []

    var shouldShowBanner: Bool {
        switch syncState {
        case .idle, .syncing, .succeeded:
            false
        case .failed, .accountUnavailable, .networkUnavailable:
            true
        }
    }

    var bannerMessage: String {
        switch syncState {
        case .accountUnavailable(let msg):
            msg
        case .networkUnavailable:
            "No network connection. Changes are saved locally."
        case .failed(let msg):
            "Sync error: \(msg)"
        default:
            ""
        }
    }

    init() {
        startMonitoring()
    }

    deinit {
        networkMonitor.cancel()
        for observer in notificationObservers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Monitoring Setup

    private func startMonitoring() {
        checkAccountStatus()
        observeAccountChanges()
        observeNetworkChanges()
        observeSyncEvents()
    }

    // MARK: - iCloud Account Status

    private func checkAccountStatus() {
        CKContainer.default().accountStatus { [weak self] status, error in
            DispatchQueue.main.async {
                self?.handleAccountStatus(status, error: error)
            }
        }
    }

    private func handleAccountStatus(_ status: CKAccountStatus, error: Error?) {
        if let error {
            syncState = .failed(error.localizedDescription)
            iCloudAccountAvailable = false
            return
        }

        switch status {
        case .available:
            iCloudAccountAvailable = true
            if case .accountUnavailable = syncState {
                syncState = .idle
            } else if syncState == .idle {
                // Already idle, no change needed
            }
        case .noAccount:
            iCloudAccountAvailable = false
            syncState = .accountUnavailable("Sign in to iCloud in System Settings to sync your tasks.")
        case .restricted:
            iCloudAccountAvailable = false
            syncState = .accountUnavailable("iCloud access is restricted on this device.")
        case .couldNotDetermine:
            iCloudAccountAvailable = false
            syncState = .accountUnavailable("Unable to determine iCloud account status.")
        case .temporarilyUnavailable:
            iCloudAccountAvailable = false
            syncState = .accountUnavailable("iCloud is temporarily unavailable. Try again later.")
        @unknown default:
            break
        }
    }

    private func observeAccountChanges() {
        let observer = NotificationCenter.default.addObserver(
            forName: .CKAccountChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.checkAccountStatus()
        }
        notificationObservers.append(observer)
    }

    // MARK: - Network Reachability

    private func observeNetworkChanges() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                let available = path.status == .satisfied
                self?.networkAvailable = available

                if !available {
                    self?.syncState = .networkUnavailable
                } else if self?.syncState == .networkUnavailable {
                    self?.syncState = .idle
                    self?.checkAccountStatus()
                }
            }
        }
        networkMonitor.start(queue: monitorQueue)
    }

    // MARK: - CloudKit Sync Events

    private func observeSyncEvents() {
        let eventName = Notification.Name("NSPersistentCloudKitContainer.eventChangedNotification")

        let observer = NotificationCenter.default.addObserver(
            forName: eventName,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.handleSyncEvent(notification)
        }
        notificationObservers.append(observer)
    }

    private func handleSyncEvent(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let event = userInfo["event"] as? NSObject else {
            return
        }

        // NSPersistentCloudKitContainer.Event has properties:
        // - type: .setup, .import, .export
        // - endDate: nil while in progress, non-nil when complete
        // - succeeded: Bool (only valid when endDate != nil)
        // - error: Error? (only valid when succeeded == false)

        let endDate = event.value(forKey: "endDate") as? Date

        if endDate == nil {
            // Event is in progress
            syncState = .syncing
        } else {
            let succeeded = (event.value(forKey: "succeeded") as? Bool) ?? false
            if succeeded {
                syncState = .succeeded
                // Reset to idle after a brief display
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                    if self?.syncState == .succeeded {
                        self?.syncState = .idle
                    }
                }
            } else {
                let error = event.value(forKey: "error") as? Error
                syncState = .failed(error?.localizedDescription ?? "Unknown sync error")
            }
        }
    }
}
