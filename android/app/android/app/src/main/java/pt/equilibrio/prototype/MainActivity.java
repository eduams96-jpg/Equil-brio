package pt.equilibrio.prototype;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrototypeStorePlugin.class);
        registerPlugin(ConnectionVaultPlugin.class);
        registerPlugin(BackupFilesPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript("window.EquilibrioBack ? window.EquilibrioBack() : false", result -> {
                    if ("false".equals(result)) moveTaskToBack(true);
                });
            }
        });
    }
}
