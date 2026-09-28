import ActivityKit
import WidgetKit
import SwiftUI

// 앱 타겟(App/CommuteLiveActivityPlugin.swift)에도 똑같은 정의가 있어야 함 — 이름과 필드가 다르면
// 앱이 시작한 라이브 액티비티를 위젯이 못 알아봄. 한쪽을 고치면 반드시 다른 쪽도 같이 고칠 것.
struct CommuteActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var urgent: Bool
        var leaveLabel: String
        var comment: String
        var transitValue: String
        var departureClock: String
        var walkText: String
        var countdownText: String
        // 출발 시각/마지막 갱신 시각(1970 기준 초). 앱이 백그라운드로 가면 JS가 멈춰서 텍스트를
        // 더 못 갱신하므로, 남은 시간은 OS가 직접 매초 그리는 타이머로 표시함. targetEpoch가 0이면 미확정.
        var targetEpoch: Double
        var updatedEpoch: Double
    }

    var routeName: String
}

private let brandBlue = Color(red: 0.145, green: 0.388, blue: 0.922)
private let urgentRed = Color(red: 0.937, green: 0.267, blue: 0.267)

private func accent(_ state: CommuteActivityAttributes.ContentState) -> Color {
    state.urgent ? urgentRed : brandBlue
}

private struct CountdownText: View {
    let state: CommuteActivityAttributes.ContentState

    var body: some View {
        if state.targetEpoch > state.updatedEpoch {
            Text(timerInterval: Date(timeIntervalSince1970: state.updatedEpoch)...Date(timeIntervalSince1970: state.targetEpoch),
                 pauseTime: nil,
                 countsDown: true,
                 showsHours: false)
                .monospacedDigit()
        } else {
            Text(state.countdownText.isEmpty ? "--:--" : state.countdownText)
                .monospacedDigit()
        }
    }
}

private struct LockScreenView: View {
    let routeName: String
    let state: CommuteActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(routeName)
                    .font(.subheadline.bold())
                    .lineLimit(1)
                Spacer()
                Text(state.transitValue)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack(alignment: .firstTextBaseline) {
                Text(state.urgent ? "지금 출발!" : "출발까지")
                    .font(.headline)
                    .foregroundStyle(accent(state))
                Spacer()
                CountdownText(state: state)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(accent(state))
                    .multilineTextAlignment(.trailing)
            }

            if !state.comment.isEmpty {
                Text(state.comment)
                    .font(.footnote.bold())
                    .foregroundStyle(accent(state))
                    .lineLimit(1)
            }

            HStack(spacing: 16) {
                Label(state.departureClock, systemImage: "clock")
                if !state.walkText.isEmpty {
                    Label(state.walkText, systemImage: "figure.walk")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(16)
    }
}

struct CommuteWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CommuteActivityAttributes.self) { context in
            LockScreenView(routeName: context.attributes.routeName, state: context.state)
                .activityBackgroundTint(Color(.systemBackground))
                .activitySystemActionForegroundColor(brandBlue)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.routeName)
                            .font(.subheadline.bold())
                            .lineLimit(1)
                        Text(context.state.transitValue)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    CountdownText(state: context.state)
                        .font(.system(size: 26, weight: .bold, design: .rounded))
                        .foregroundStyle(accent(context.state))
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 90, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        if !context.state.comment.isEmpty {
                            Text(context.state.comment)
                                .font(.footnote.bold())
                                .foregroundStyle(accent(context.state))
                                .lineLimit(1)
                        }
                        HStack(spacing: 16) {
                            Label(context.state.departureClock, systemImage: "clock")
                            if !context.state.walkText.isEmpty {
                                Label(context.state.walkText, systemImage: "figure.walk")
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: "tram.fill")
                    .foregroundStyle(accent(context.state))
            } compactTrailing: {
                CountdownText(state: context.state)
                    .font(.caption.bold())
                    .foregroundStyle(accent(context.state))
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 48)
            } minimal: {
                Image(systemName: "tram.fill")
                    .foregroundStyle(accent(context.state))
            }
            .keylineTint(accent(context.state))
        }
    }
}
