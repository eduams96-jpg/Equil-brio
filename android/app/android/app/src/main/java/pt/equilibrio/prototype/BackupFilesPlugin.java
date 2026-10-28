package pt.equilibrio.prototype;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@CapacitorPlugin(name="BackupFiles")
public class BackupFilesPlugin extends Plugin {
    private static final int LIMIT = 16 * 1024 * 1024;
    @PluginMethod public void exportBackup(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.length() > LIMIT) { call.reject("Cópia inválida ou demasiado grande."); return; }
        // Capacitor saves activity-result call options in the Android state Bundle.
        // A backup must stay in a private file, not in Binder's small state parcel.
        File pending = null;
        try {
            String id = UUID.randomUUID().toString();
            pending = new File(getContext().getCacheDir(), "equilibrio-backup-" + id + ".json");
            byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > LIMIT) throw new Exception();
            try (FileOutputStream out = new FileOutputStream(pending)) { out.write(bytes); }
            call.getData().remove("data");
            call.getData().put("pendingExportId", id);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"Equilibrio-Android-backup.json");
            startActivityForResult(call,intent,"created");
        } catch (Exception e) {
            if (pending != null) pending.delete();
            call.reject("Não foi possível preparar a cópia. Os dados da aplicação mantêm-se.");
        }
    }
    @ActivityCallback private void created(PluginCall call, ActivityResult result) {
        if (call == null) return;
        File pending = null;
        try {
            String id = call.getString("pendingExportId", "");
            if (!id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) throw new Exception();
            pending = new File(getContext().getCacheDir(), "equilibrio-backup-" + id + ".json");
            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { call.reject("Gravação da cópia cancelada."); return; }
            if (!pending.isFile() || pending.length() > LIMIT) throw new Exception();
            try (InputStream in = new FileInputStream(pending); OutputStream out = getContext().getContentResolver().openOutputStream(result.getData().getData(),"wt")) {
                if(out == null) throw new Exception();
                byte[] chunk = new byte[8192]; int count;
                while ((count = in.read(chunk)) != -1) out.write(chunk, 0, count);
                out.flush(); call.resolve();
            }
        } catch(Exception e) { call.reject("Não foi possível guardar a cópia. Os dados da aplicação mantêm-se."); }
        finally { if (pending != null) pending.delete(); }
    }
    @PluginMethod public void importBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
        startActivityForResult(call,intent,"opened");
    }
    @ActivityCallback private void opened(PluginCall call, ActivityResult result) {
        if(call == null) return;
        if(result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { call.reject("Abertura da cópia cancelada."); return; }
        try(InputStream in = getContext().getContentResolver().openInputStream(result.getData().getData())) {
            if(in == null) throw new Exception();
            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[8192]; int count;
            while((count = in.read(chunk)) != -1) { if(buffer.size() + count > LIMIT) throw new Exception(); buffer.write(chunk,0,count); }
            byte[] bytes = buffer.toByteArray();
            JSObject value = new JSObject(); value.put("data",new String(bytes,StandardCharsets.UTF_8)); call.resolve(value);
        } catch(Exception e) { call.reject("Não foi possível ler esta cópia."); }
    }
}
