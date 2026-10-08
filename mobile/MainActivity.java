package com.localmusic.video;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LmvEnginePlugin.class);   // yt-dlp + FFmpeg engine, publishes into Music/ and Movies/
        registerPlugin(LocalSendPlugin.class);   // LocalSend discovery + receiver
        super.onCreate(savedInstanceState);
    }
}
