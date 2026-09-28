import Foundation
import Capacitor
import ActivityKit

// 위젯 타겟(CommuteWidget/CommuteWidgetLiveActivity.swift)에도 똑같은 정의가 있어야 함 — 이름과
// 필드가 다르면 앱이 시작한 라이브 액티비티를 위젯이 못 알아봄. 한쪽을 고치면 반드시 같이 고칠 것.
struct CommuteActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var urgent: Bool
        var leaveLabel: String
        var comment: String
        var transitValue: String
        var departureClock: String
        var walkText: String
        var countdownText: String
        var targetEpoch: Double
        var updatedEpoch: Double
    }

    var routeName: String
}

// services/commuteNotificationService.ts의 CommuteNotification 플러그인(안드로이드는
// CommuteNotificationPlugin.java)과 같은 이름/메서드로 맞춘 iOS 구현. 잠금화면·다이나믹 아일랜드에
// 라이브 액티비티로 막차까지 남은 시간을 보여줌. iOS는 앱이 백그라운드로 가면 JS가 멈춰서 update가
// 더 못 오므로, 남은 시간은 targetEpoch 기반 OS 타이머로 그림(위젯 쪽 CountdownText).
@objc(CommuteNotificationPlugin)
public class CommuteNotificationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CommuteNotificationPlugin"
    public let jsName = "CommuteNotification"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private func makeState(_ call: CAPPluginCall) -> CommuteActivityAttributes.ContentState {
        let targetMs = call.getDouble("targetEpochMs") ?? 0
        return CommuteActivityAttributes.ContentState(
            urgent: call.getBool("urgent") ?? false,
            leaveLabel: call.getString("leaveLabel") ?? "",
            comment: call.getString("comment") ?? "",
            transitValue: call.getString("transitValue") ?? "",
            departureClock: call.getString("departureClock") ?? "--:--",
            walkText: call.getString("walkText") ?? "",
            countdownText: call.getString("countdownText") ?? "",
            targetEpoch: targetMs > 0 ? targetMs / 1000 : 0,
            updatedEpoch: Date().timeIntervalSince1970
        )
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve()
            return
        }
        let attributes = CommuteActivityAttributes(routeName: call.getString("routeName") ?? "찐막차")
        let state = makeState(call)
        Task {
            for activity in Activity<CommuteActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            do {
                _ = try Activity.request(
                    attributes: attributes,
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
            } catch {
                // 사용자가 라이브 액티비티를 껐거나 동시 실행 한도 초과 — 핵심 기능이 아니라 조용히 무시
            }
            call.resolve()
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        let state = makeState(call)
        Task {
            for activity in Activity<CommuteActivityAttributes>.activities {
                await activity.update(ActivityContent(state: state, staleDate: nil))
            }
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        Task {
            for activity in Activity<CommuteActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}

// 앱 안에서 만든 커스텀 플러그인은 npm 플러그인처럼 자동 등록되지 않아서(cap sync가 만드는
// capacitor.config.json의 packageClassList는 매번 덮어써짐) 브릿지 로드 시점에 직접 등록함.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CommuteNotificationPlugin())
    }
}
