package com.quran.qasas;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SherpaAsrPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
