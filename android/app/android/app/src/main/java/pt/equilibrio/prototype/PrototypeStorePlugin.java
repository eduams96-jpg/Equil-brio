package pt.equilibrio.prototype;

import android.content.ContentValues;

import android.content.Context;

import android.database.Cursor;

import android.database.sqlite.SQLiteDatabase;

import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSObject;

import com.getcapacitor.Plugin;

import com.getcapacitor.PluginCall;

import com.getcapacitor.PluginMethod;

import com.getcapacitor.annotation.CapacitorPlugin;

/** Fixed private database and transactional CAS; never accepts SQL or a path from JS. */

@CapacitorPlugin(name = "PrototypeStore")

public class PrototypeStorePlugin extends Plugin {

    private Store helper;

    private final Object gate = new Object();

    @Override public void load() { helper = new Store(getContext()); }

    @Override protected void handleOnDestroy() { synchronized (gate) { if (helper != null) helper.close(); } }

    private static class Store extends SQLiteOpenHelper {

        Store(Context context) { super(context, "equilibrio-prototype.db", null, 1); }

        @Override public void onConfigure(SQLiteDatabase db) { db.setForeignKeyConstraintsEnabled(true); db.execSQL("PRAGMA synchronous=FULL"); }

        @Override public void onCreate(SQLiteDatabase db) {

            db.execSQL("CREATE TABLE state(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)");

        }

        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {

            throw new IllegalStateException("Migração de protótipo não suportada; dados preservados.");

        }

    }

    private JSObject snapshot(SQLiteDatabase db) throws Exception {

        JSObject result = new JSObject();

        try (Cursor cursor = db.rawQuery("SELECT revision,payload FROM state WHERE id=1", null)) {

            if (cursor.moveToFirst()) {

                result.put("revision", cursor.getLong(0));

                result.put("state", new JSObject(cursor.getString(1)));

            } else {

                result.put("revision", 0);

                result.put("state", org.json.JSONObject.NULL);

            }

        }

        result.put("storage", "SQLite");

        return result;

    }

    @PluginMethod public void read(PluginCall call) {

        synchronized (gate) {

            try { call.resolve(snapshot(helper.getReadableDatabase())); }

            catch (Exception error) { call.reject("Não foi possível ler SQLite. Os dados foram preservados.", "READ_FAILED"); }

        }

    }

    @PluginMethod public void compareAndSet(PluginCall call) {

        JSObject state = call.getObject("state");

        Integer expected = call.getInt("expectedRevision");

        if (state == null || expected == null || expected < 0 || expected == Integer.MAX_VALUE || state.optInt("format") != 1 ||

                state.optJSONObject("confirmed") == null || state.optJSONArray("outbox") == null ||

                state.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 8388608) {

            call.reject("Estado inválido; nada foi gravado.", "INVALID_STATE"); return;

        }

        synchronized (gate) {

            SQLiteDatabase db = helper.getWritableDatabase();

            JSObject saved;

            db.beginTransaction();

            try {

                JSObject current = snapshot(db);

                if (current.getLong("revision") != expected) throw new IllegalStateException("REVISION_CONFLICT");

                if (Boolean.TRUE.equals(call.getBoolean("preservePrevious", false)) && expected > 0) {

                    db.execSQL("CREATE TABLE IF NOT EXISTS recovery_checkpoints(id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER NOT NULL, payload TEXT NOT NULL)");

                    db.execSQL("INSERT INTO recovery_checkpoints(revision,payload) SELECT revision,payload FROM state WHERE id=1");

                    db.execSQL("DELETE FROM recovery_checkpoints WHERE id NOT IN (SELECT id FROM recovery_checkpoints ORDER BY id DESC LIMIT 3)");

                }

                JSObject archive = call.getObject("archiveSource");

                if (archive != null) {

                    if(archive.optInt("format") != 1 || archive.optJSONObject("confirmed") == null || archive.optJSONArray("outbox") == null || archive.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 8388608) throw new IllegalStateException("INVALID_ARCHIVE");

                    db.execSQL("CREATE TABLE IF NOT EXISTS recovery_checkpoints(id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER NOT NULL, payload TEXT NOT NULL)");

                    db.execSQL("INSERT INTO recovery_checkpoints(revision,payload) VALUES(0,?)",new Object[]{archive.toString()});

                    db.execSQL("DELETE FROM recovery_checkpoints WHERE id NOT IN (SELECT id FROM recovery_checkpoints ORDER BY id DESC LIMIT 3)");

                }

                ContentValues values = new ContentValues();

                values.put("id", 1); values.put("revision", expected + 1); values.put("payload", state.toString());

                if (expected == 0) db.insertOrThrow("state", null, values);

                else if (db.update("state", values, "id=1 AND revision=?", new String[]{expected.toString()}) != 1)

                    throw new IllegalStateException("REVISION_CONFLICT");

                saved = snapshot(db);

                db.setTransactionSuccessful();

            } catch (Exception error) {

                call.reject("Gravação não aplicada; recarrega antes de tentar novamente.", "WRITE_FAILED"); return;

            } finally { db.endTransaction(); }

            // Resolve only after the durable transaction ended successfully.

            call.resolve(saved);

        }

    }

    @PluginMethod public void listCheckpoints(PluginCall call) {

        synchronized(gate) { try {

            SQLiteDatabase db=helper.getWritableDatabase();

            db.execSQL("CREATE TABLE IF NOT EXISTS recovery_checkpoints(id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER NOT NULL, payload TEXT NOT NULL)");

            org.json.JSONArray rows=new org.json.JSONArray();

            try(Cursor c=db.rawQuery("SELECT id,revision,payload FROM recovery_checkpoints ORDER BY id DESC",null)) {

                while(c.moveToNext()) {

                    JSObject state=new JSObject(c.getString(2)),row=new JSObject();

                    row.put("id",c.getLong(0));row.put("revision",c.getLong(1));

                    row.put("serverId",state.optString("serverId"));row.put("deviceId",state.optString("deviceId"));

                    row.put("operations",state.optJSONArray("outbox").length());

                    row.put("transactions",state.getJSONObject("confirmed").getJSONObject("ledger").optJSONArray("transactions").length());rows.put(row);

                }

            }

            JSObject result=new JSObject();result.put("checkpoints",rows);call.resolve(result);

        }catch(Exception e){call.reject("Não foi possível listar os pontos anteriores.");} }

    }

    @PluginMethod public void readCheckpoint(PluginCall call) {

        Integer id=call.getInt("id");if(id==null||id<1){call.reject("Ponto inválido.");return;}

        synchronized(gate) { try(Cursor c=helper.getReadableDatabase().rawQuery("SELECT payload FROM recovery_checkpoints WHERE id=?",new String[]{id.toString()})) {

            if(!c.moveToFirst())throw new Exception();JSObject result=new JSObject();result.put("state",new JSObject(c.getString(0)));call.resolve(result);

        }catch(Exception e){call.reject("O ponto anterior já não está disponível.");} }

    }

}

