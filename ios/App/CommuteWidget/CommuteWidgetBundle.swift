//
//  CommuteWidgetBundle.swift
//  CommuteWidget
//
//  Created by sseokee on 9/23/26.
//

import WidgetKit
import SwiftUI

@main
struct CommuteWidgetBundle: WidgetBundle {
    var body: some Widget {
        CommuteWidget()
        CommuteWidgetControl()
        CommuteWidgetLiveActivity()
    }
}
