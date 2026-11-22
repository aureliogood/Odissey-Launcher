package com.odissey.client.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import net.fabricmc.loader.api.FabricLoader;

public final class OdisseyConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path PATH = FabricLoader.getInstance().getConfigDir().resolve("odissey-client.json");

	public boolean showFps = true;
	public boolean showPing = true;
	public boolean showCoords = true;
	public boolean showClock = true;
	public boolean showCps = true;
	public boolean showKeystrokes = true;

	public int infoX = 8;
	public int infoY = 8;
	public int keysX = -1;
	public int keysY = -1;

	public static OdisseyConfig load() {
		try {
			if (!Files.isRegularFile(PATH)) {
				return new OdisseyConfig();
			}
			OdisseyConfig config = GSON.fromJson(Files.readString(PATH, StandardCharsets.UTF_8), OdisseyConfig.class);
			if (config == null) {
				return new OdisseyConfig();
			}
			config.sanitize();
			return config;
		} catch (RuntimeException | IOException ignored) {
			return new OdisseyConfig();
		}
	}

	public void save() {
		sanitize();
		try {
			Files.createDirectories(PATH.getParent());
			Path temp = PATH.resolveSibling(PATH.getFileName() + ".tmp");
			Files.writeString(temp, GSON.toJson(this), StandardCharsets.UTF_8);
			try {
				Files.move(temp, PATH, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			} catch (IOException ignored) {
				Files.move(temp, PATH, StandardCopyOption.REPLACE_EXISTING);
			}
		} catch (IOException ignored) {
		}
	}

	public void resetPositions() {
		infoX = 8;
		infoY = 8;
		keysX = -1;
		keysY = -1;
	}

	public void resetAll() {
		showFps = true;
		showPing = true;
		showCoords = true;
		showClock = true;
		showCps = true;
		showKeystrokes = true;
		resetPositions();
	}

	private void sanitize() {
		infoX = Math.max(0, Math.min(4096, infoX));
		infoY = Math.max(0, Math.min(4096, infoY));
		keysX = Math.max(-1, Math.min(4096, keysX));
		keysY = Math.max(-1, Math.min(4096, keysY));
	}
}
