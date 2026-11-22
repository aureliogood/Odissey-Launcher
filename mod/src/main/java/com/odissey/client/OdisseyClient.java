package com.odissey.client;

import com.mojang.blaze3d.platform.InputConstants;
import com.odissey.client.config.OdisseyConfig;
import com.odissey.client.hud.HudRenderer;
import com.odissey.client.ui.OdisseyMenuScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.KeyMapping;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class OdisseyClient implements ClientModInitializer {
	public static final String MOD_ID = "odissey";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	private static OdisseyConfig config;
	private static KeyMapping menuKey;

	@Override
	public void onInitializeClient() {
		config = OdisseyConfig.load();
		KeyMapping.Category category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath(MOD_ID, "main"));
		menuKey = KeyBindingHelper.registerKeyBinding(
			new KeyMapping("key.odissey.menu", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, category)
		);
		HudRenderer hud = new HudRenderer(config);
		HudElementRegistry.addLast(Identifier.fromNamespaceAndPath(MOD_ID, "hud"), hud);

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			while (menuKey.consumeClick()) {
				if (client.screen == null) {
					client.setScreen(new OdisseyMenuScreen(config, hud));
				}
			}
		});

		LOGGER.info("Odissey Client cargado (HUD y menú listos)");
	}
}
