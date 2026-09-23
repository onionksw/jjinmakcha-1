//
//  CommuteWidgetLiveActivity.swift
//  CommuteWidget
//
//  Created by sseokee on 9/23/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct CommuteWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct CommuteWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CommuteWidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension CommuteWidgetAttributes {
    fileprivate static var preview: CommuteWidgetAttributes {
        CommuteWidgetAttributes(name: "World")
    }
}

extension CommuteWidgetAttributes.ContentState {
    fileprivate static var smiley: CommuteWidgetAttributes.ContentState {
        CommuteWidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: CommuteWidgetAttributes.ContentState {
         CommuteWidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: CommuteWidgetAttributes.preview) {
   CommuteWidgetLiveActivity()
} contentStates: {
    CommuteWidgetAttributes.ContentState.smiley
    CommuteWidgetAttributes.ContentState.starEyes
}
