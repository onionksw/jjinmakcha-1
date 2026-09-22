package com.jjinmakcha.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CommuteNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
