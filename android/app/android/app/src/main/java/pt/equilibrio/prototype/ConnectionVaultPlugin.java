package pt.equilibrio.prototype;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Encrypted platform storage for prototype pairing credentials; no plaintext fallback. */
@CapacitorPlugin(name = "ConnectionVault")
public class ConnectionVaultPlugin extends Plugin {
    private static final String ALIAS = "equilibrio.prototype.connection.v1";
    private final Object gate = new Object();
    private SharedPreferences preferences() { return getContext().getSharedPreferences("connection-vault", Context.MODE_PRIVATE); }
    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            if (!create) throw new IllegalStateException("KEY_UNAVAILABLE");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
            return generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    private JSObject stored() throws Exception {
        String sealed = preferences().getString("sealed", null);
        if (sealed == null) return null;
        JSObject envelope = new JSObject(sealed);
        if (envelope.getInt("version") != 1) throw new IllegalStateException("VERSION");
        byte[] iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
        cipher.updateAAD(ALIAS.getBytes(StandardCharsets.UTF_8));
        byte[] plain = cipher.doFinal(Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP));
        return new JSObject(new String(plain, StandardCharsets.UTF_8));
    }
    @PluginMethod public void read(PluginCall call) {
        synchronized (gate) {
            try {
                JSObject result = new JSObject(); JSObject value = stored();
                result.put("connection", value == null ? org.json.JSONObject.NULL : value);
                result.put("protection", "AndroidKeyStore/AES-GCM"); call.resolve(result);
            } catch (Exception error) { call.reject("Não foi possível abrir a ligação protegida. Os dados foram preservados.", "VAULT_READ_FAILED"); }
        }
    }
    @PluginMethod public void write(PluginCall call) {
        JSObject value = call.getObject("connection");
        if (value == null || value.toString().length() > 8192 || !value.has("kind")) { call.reject("Ligação inválida.", "VAULT_INVALID"); return; }
        synchronized (gate) {
            try {
                // Never overwrite an unreadable existing vault with a replacement key.
                if (preferences().contains("sealed")) stored();
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(true));
                cipher.updateAAD(ALIAS.getBytes(StandardCharsets.UTF_8));
                JSObject envelope = new JSObject(); envelope.put("version", 1);
                envelope.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
                envelope.put("ciphertext", Base64.encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
                if (!preferences().edit().putString("sealed", envelope.toString()).commit()) throw new IllegalStateException("COMMIT");
                JSObject result = new JSObject(); result.put("saved", true); call.resolve(result);
            } catch (Exception error) { call.reject("Não foi possível guardar a ligação protegida. Nenhuma ligação foi confirmada.", "VAULT_WRITE_FAILED"); }
        }
    }
    @PluginMethod public void clear(PluginCall call) {
        synchronized (gate) {
            try {
                stored();
                if (!preferences().edit().remove("sealed").commit()) throw new IllegalStateException("COMMIT");
                call.resolve();
            } catch (Exception error) { call.reject("A tentativa protegida foi preservada.", "VAULT_CLEAR_FAILED"); }
        }
    }
}
