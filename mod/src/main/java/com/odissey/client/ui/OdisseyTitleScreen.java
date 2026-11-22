package com.odissey.client.ui;

import com.mojang.authlib.GameProfile;
import com.mojang.authlib.minecraft.BanDetails;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.SharedConstants;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.navigation.ScreenRectangle;
import net.minecraft.client.gui.screens.CreditsAndAttributionScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.multiplayer.SafetyScreen;
import net.minecraft.client.gui.screens.options.AccessibilityOptionsScreen;
import net.minecraft.client.gui.screens.options.LanguageSelectScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.util.Util;
import org.lwjgl.glfw.GLFW;

public final class OdisseyTitleScreen extends Screen {
	private static final int GOLD = 0xFFF2C94C;
	private static final int GOLD_SOFT = 0xFFFFDF7A;
	private static final int GOLD_DEEP = 0xFFB8891F;
	private static final int WHITE = 0xFFF7F4EE;
	private static final int MUTED = 0xFFABA59A;
	private static final int DIM = 0xFF6E6A63;
	private static final int GREEN = 0xFF7DD8A2;

	private static final Identifier BACKGROUND = Identifier.fromNamespaceAndPath("odissey", "textures/gui/title_background.png");
	private static final Identifier BRAND_EMBLEM = Identifier.fromNamespaceAndPath("odissey", "textures/gui/odissey_emblem.png");
	private static final Identifier BRAND_WORDMARK = Identifier.fromNamespaceAndPath("odissey", "textures/gui/odissey_wordmark.png");
	private static final Identifier[] DOCK_ICONS = {
		Identifier.fromNamespaceAndPath("odissey", "textures/gui/icons/settings.png"),
		Identifier.fromNamespaceAndPath("odissey", "textures/gui/icons/language.png"),
		Identifier.fromNamespaceAndPath("odissey", "textures/gui/icons/accessibility.png"),
		Identifier.fromNamespaceAndPath("odissey", "textures/gui/icons/info.png"),
		Identifier.fromNamespaceAndPath("odissey", "textures/gui/icons/power.png")
	};
	private static final Identifier[] BUTTON_TEXTURES = {
		Identifier.fromNamespaceAndPath("odissey", "textures/gui/buttons/singleplayer.png"),
		Identifier.fromNamespaceAndPath("odissey", "textures/gui/buttons/multiplayer.png"),
		Identifier.fromNamespaceAndPath("odissey", "textures/gui/buttons/store.png"),
		Identifier.fromNamespaceAndPath("odissey", "textures/gui/buttons/discord.png")
	};
	private static final int[][] BUTTON_TEXTURE_SIZES = {
		{462, 62}, {463, 62}, {205, 36}, {206, 36}
	};
	private static final FeatureButton[] FEATURE_BUTTONS = {
		feature("realms", Action.MULTIPLAYER, "Minecraft Realms"),
		feature("moon", Action.ACCESSIBILITY, "Accesibilidad"),
		feature("crown", Action.STORE, "Tienda"),
		feature("settings", Action.OPTIONS, "Ajustes"),
		feature("globe", Action.LANGUAGE, "Idioma"),
		feature("community", Action.DISCORD, "Discord"),
		feature("crown", Action.STORE, "Tienda"),
		feature("community", Action.DISCORD, "Discord"),
		feature("compass", Action.CREDITS, "Créditos")
	};
	private static final FeatureButton[] UTILITY_BUTTONS = {
		feature("camera", null, "Capturas próximamente"),
		feature("attachment", Action.DISCORD, "Enlaces de comunidad")
	};
	private static final int FEATURE_ICON_SIZE = 18;
	private static final int FEATURE_ICON_TEXTURE_SIZE = 96;
	private static final int DOCK_ICON_TEXTURE_SIZE = 96;
	private static final int BACKGROUND_WIDTH = 1920;
	private static final int BACKGROUND_HEIGHT = 1080;
	private static final int BRAND_WORDMARK_TEXTURE_WIDTH = 616;
	private static final int BRAND_WORDMARK_TEXTURE_HEIGHT = 100;
	private static final int DESIGN_WIDTH = 480;
	private static final int DESIGN_HEIGHT = 270;
	private static final String LOGO_TEXT = "ODISSEY";
	private static final int LOGO_TRACKING = 1;
	private static final String STORE_URL = "";
	private static final String DISCORD_URL = "";

	private static final Action[] BUTTON_ACTIONS = {
		Action.SINGLEPLAYER, Action.MULTIPLAYER, Action.STORE, Action.DISCORD
	};
	private static final Link[] LINKS = {
		new Link(Action.OPTIONS, "Ajustes"),
		new Link(Action.LANGUAGE, "Idioma"),
		new Link(Action.ACCESSIBILITY, "Accesibilidad"),
		new Link(Action.CREDITS, "Créditos"),
		new Link(Action.QUIT, "Salir")
	};
	private static final Action[] FOCUS_ORDER = {
		Action.SINGLEPLAYER,
		Action.MULTIPLAYER,
		Action.STORE,
		Action.DISCORD,
		Action.OPTIONS,
		Action.LANGUAGE,
		Action.ACCESSIBILITY,
		Action.CREDITS,
		Action.QUIT,
		Action.MULTIPLAYER,
		Action.ACCESSIBILITY,
		Action.STORE,
		Action.OPTIONS,
		Action.LANGUAGE,
		Action.DISCORD,
		Action.STORE,
		Action.DISCORD,
		Action.CREDITS,
		Action.DISCORD
	};

	private static final long INTRO_MS = 220L;
	private static final long PRESS_MS = 80L;

	private final float[] buttonHover = new float[BUTTON_ACTIONS.length];
	private final float[] linkHover = new float[LINKS.length];
	private final float[] featureHover = new float[FEATURE_BUTTONS.length + UTILITY_BUTTONS.length];
	private final String clientVersion;
	private final String loaderVersion;
	private final String minecraftVersion;
	private String accountName = "Jugador";
	private boolean accountOnline;
	private long openedAt = Util.getMillis();
	private long lastFrame;
	private long pressedAt;
	private int focus;
	private boolean keyboardFocus;
	private Action pending;
	private Component multiplayerDisabled;
	private float uiScale = 1.0F;
	private float uiOriginX;
	private float uiOriginY;

	public OdisseyTitleScreen() {
		super(Component.literal("Odissey Client"));
		this.clientVersion = modVersion("odissey");
		this.loaderVersion = modVersion("fabricloader");
		this.minecraftVersion = SharedConstants.getCurrentVersion().name();
	}

	@Override
	protected void init() {
		this.multiplayerDisabled = this.multiplayerDisabledReason();
		GameProfile profile = this.minecraft.getGameProfile();
		if (profile != null && profile.name() != null && !profile.name().isBlank()) {
			this.accountName = profile.name();
		}
		this.accountOnline = profile != null && !profile.properties().get("textures").isEmpty();
	}

	@Override
	public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		this.drawBackdrop(graphics, this.introOpacity());
	}

	@Override
	public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		this.updateViewport();
		float opacity = this.introOpacity();
		Layout layout = this.layout();
		double uiMouseX = this.toDesignX(mouseX);
		double uiMouseY = this.toDesignY(mouseY);
		this.updateHover(uiMouseX, uiMouseY);

		graphics.pose().pushMatrix();
		graphics.pose().translate(this.uiOriginX, this.uiOriginY);
		graphics.pose().scale(this.uiScale, this.uiScale);

		this.drawBrand(graphics, layout, opacity);
		this.drawAccount(graphics, layout, opacity);
		this.drawMenu(graphics, layout, uiMouseX, uiMouseY, opacity);
		this.drawFeatureButtons(graphics, opacity);
		this.drawDock(graphics, layout, uiMouseX, uiMouseY, opacity);
		this.drawFooter(graphics, layout, opacity);
		this.drawDisabledTooltip(graphics, layout, mouseX, mouseY, uiMouseX, uiMouseY);

		graphics.pose().popMatrix();

		super.render(graphics, mouseX, mouseY, partialTick);

		if (this.pending != null && Util.getMillis() - this.pressedAt >= PRESS_MS) {
			Action action = this.pending;
			this.pending = null;
			this.activate(action);
		}
	}

	private void updateViewport() {
		this.uiScale = Math.min(this.width / (float)DESIGN_WIDTH, this.height / (float)DESIGN_HEIGHT);
		this.uiOriginX = (this.width - DESIGN_WIDTH * this.uiScale) / 2.0F;
		this.uiOriginY = (this.height - DESIGN_HEIGHT * this.uiScale) / 2.0F;
	}

	private double toDesignX(double x) {
		return (x - this.uiOriginX) / this.uiScale;
	}

	private double toDesignY(double y) {
		return (y - this.uiOriginY) / this.uiScale;
	}

	private void drawBackdrop(GuiGraphics graphics, float opacity) {
		this.drawCover(graphics, BACKGROUND, BACKGROUND_WIDTH, BACKGROUND_HEIGHT, 0, 0, this.width, this.height);
		graphics.fill(0, 0, this.width, this.height, OdisseyText.alpha(0x62000000, opacity));
		graphics.fillGradient(
			0,
			0,
			this.width,
			Math.min(240, this.height / 2),
			OdisseyText.alpha(0x9C000000, opacity),
			0x00000000
		);
		graphics.fillGradient(
			0,
			Math.max(0, this.height - Math.min(220, this.height / 2)),
			this.width,
			this.height,
			0x00000000,
			OdisseyText.alpha(0xB8000000, opacity)
		);

		int bands = 24;
		int bandWidth = Math.max(1, Math.round(this.width * 0.16F));
		for (int band = 0; band < bands; band++) {
			float strength = (float)Math.pow(1.0F - band / (float)(bands - 1), 1.35F);
			int alpha = Math.round(0x2E * strength * opacity) << 24;
			int inset = band * bandWidth / bands;
			int next = (band + 1) * bandWidth / bands;
			graphics.fill(inset, 0, next, this.height, alpha);
			graphics.fill(this.width - next, 0, this.width - inset, this.height, alpha);
		}

		graphics.fill(0, 0, this.width, this.height, OdisseyText.alpha(0x30213542, opacity));
		graphics.fill(0, 0, this.width, this.height, OdisseyText.alpha(0xFF000000, 1.0F - opacity));
	}

	private void drawBrand(GuiGraphics graphics, Layout layout, float opacity) {
		int centerX = DESIGN_WIDTH / 2;
		int emblemSize = 26;
		int emblemX = centerX - emblemSize / 2;
		int logoWidth = 112;
		int logoHeight = Math.round(logoWidth * BRAND_WORDMARK_TEXTURE_HEIGHT / (float)BRAND_WORDMARK_TEXTURE_WIDTH);
		int logoX = centerX - logoWidth / 2;
		int logoY = layout.brandY() + emblemSize + 3;

		// Use the supplied high-resolution transparent brand assets instead of
		// building the compass out of one-pixel primitives. This keeps its circle
		// round and the lettering crisp at every Minecraft GUI scale.
		graphics.blit(BRAND_EMBLEM, emblemX, layout.brandY(), emblemX + emblemSize, layout.brandY() + emblemSize, 0.0F, 1.0F, 0.0F, 1.0F);
		graphics.blit(BRAND_WORDMARK, logoX, logoY, logoX + logoWidth, logoY + logoHeight, 0.0F, 1.0F, 0.0F, 1.0F);
	}

	private void drawEmblem(GuiGraphics graphics, int centerX, int y, int size, float opacity) {
		int radius = size / 2;
		int centerY = y + radius;
		UiDraw.fillRounded(graphics, centerX - radius + 1, centerY - radius + 2, size, size, radius, OdisseyText.alpha(0x50000000, opacity));
		UiDraw.fillRounded(graphics, centerX - radius, centerY - radius, size, size, radius, OdisseyText.alpha(0xE6B8891F, opacity));
		UiDraw.fillRounded(graphics, centerX - radius + 1, centerY - radius + 1, size - 2, size - 2, Math.max(0, radius - 1), OdisseyText.alpha(0xF20B0D12, opacity));
		drawRing(graphics, centerX, centerY, Math.max(2, radius - 2), OdisseyText.alpha(GOLD, opacity * 0.92F), 0.0F, 360.0F);
		int longArm = Math.max(5, Math.round(size * 0.34F));
		int shortArm = Math.max(2, Math.round(size * 0.10F));
		fillDiamond(graphics, centerX, centerY, shortArm, longArm, OdisseyText.alpha(GOLD, opacity));
		fillDiamond(graphics, centerX, centerY, longArm, shortArm, OdisseyText.alpha(GOLD_DEEP, opacity));
		fillDiamond(graphics, centerX, centerY, Math.max(1, shortArm - 1), longArm / 2, OdisseyText.alpha(GOLD_SOFT, opacity));
		graphics.fill(centerX, centerY, centerX + 1, centerY + 1, OdisseyText.alpha(GOLD_SOFT, opacity));
	}

	private static void fillDiamond(GuiGraphics graphics, int cx, int cy, int halfWidth, int halfHeight, int color) {
		int height = Math.max(1, halfHeight);
		for (int offset = -height; offset <= height; offset++) {
			float progress = 1.0F - Math.abs(offset) / (float)height;
			int span = Math.round(halfWidth * progress);
			graphics.fill(cx - span, cy + offset, cx + span + 1, cy + offset + 1, color);
		}
	}

	private void drawAccount(GuiGraphics graphics, Layout layout, float opacity) {
		if (!layout.showAccount()) {
			return;
		}

		String name = this.accountName;
		if (OdisseyText.strongWidth(this.font, name) > 78) {
			name = name.substring(0, Math.min(12, name.length() - 1)) + "..";
		}
		String tag = this.accountOnline ? "ONLINE" : "LOCAL";
		int tagWidth = OdisseyText.smallWidth(this.font, tag);
		int contentWidth = Math.max(OdisseyText.strongWidth(this.font, name), tagWidth + 5);
		int width = 20 + contentWidth + 7;
		int height = 18;
		int x = DESIGN_WIDTH - layout.margin() - width;
		int y = 14;
		int dot = this.accountOnline ? GREEN : MUTED;

		UiDraw.fillRounded(graphics, x + 1, y + 2, width, height, 5, OdisseyText.alpha(0x4C000000, opacity));
		UiDraw.fillRounded(graphics, x, y, width, height, 5, OdisseyText.alpha(0x22FFFFFF, opacity));
		UiDraw.fillRounded(graphics, x + 1, y + 1, width - 2, height - 2, 4, OdisseyText.alpha(0x5C0A0B0E, opacity));

		int avatarSize = 12;
		int avatarX = x + 4;
		int avatarY = y + 3;
		UiDraw.fillRounded(graphics, avatarX, avatarY, avatarSize, avatarSize, 6, OdisseyText.alpha(0x30F2C94C, opacity));
		String initial = name.substring(0, 1).toUpperCase();
		int initialX = Math.round(avatarX + (avatarSize - OdisseyText.smallWidth(this.font, initial)) / 2.0F);
		OdisseyText.drawSmall(graphics, this.font, initial, initialX, avatarY + 2, OdisseyText.alpha(GOLD_SOFT, opacity));

		OdisseyText.drawStrong(graphics, this.font, name, x + 20, y + 2, OdisseyText.alpha(WHITE, opacity));
		graphics.fill(x + 20, y + 11, x + 23, y + 14, OdisseyText.alpha(dot, opacity));
		OdisseyText.drawSmall(graphics, this.font, tag, x + 25, y + 9, OdisseyText.alpha(dot, opacity * 0.95F));
	}

	private void drawMenu(GuiGraphics graphics, Layout layout, double mouseX, double mouseY, float opacity) {
		for (int index = 0; index < BUTTON_ACTIONS.length; index++) {
			Action action = BUTTON_ACTIONS[index];
			boolean enabled = this.isEnabled(action);
			int x = layout.buttonX(index);
			int y = layout.buttonY(index);
			boolean focused = this.keyboardFocus && this.focus == index && enabled;
			float response = this.pending == action ? 1.0F : this.buttonHover[index];
			response = Math.max(response, focused ? 0.9F : 0.0F);
			boolean pressed = this.pending == action;

			this.drawButton(
				graphics,
				index,
				x,
				y,
				layout.buttonWidth(index),
				layout.buttonHeight(index),
				enabled,
				pressed,
				focused,
				response,
				opacity
			);
		}
	}

	private void drawFeatureButtons(GuiGraphics graphics, float opacity) {
		for (int index = 0; index < FEATURE_BUTTONS.length; index++) {
			FeatureButton feature = FEATURE_BUTTONS[index];
			int x = featureX(index);
			int y = featureY(index);
			boolean enabled = feature.action() != null && this.isEnabled(feature.action());
			int focusIndex = BUTTON_ACTIONS.length + LINKS.length + index;
			boolean focused = this.keyboardFocus && this.focus == focusIndex && enabled;
			float response = Math.max(this.featureHover[index], focused ? 1.0F : 0.0F);
			this.drawFeatureTile(graphics, feature, x, y, FEATURE_ICON_SIZE, enabled, focused, response, opacity);
		}

		for (int index = 0; index < UTILITY_BUTTONS.length; index++) {
			FeatureButton feature = UTILITY_BUTTONS[index];
			int x = utilityX(index);
			int y = 14;
			boolean enabled = feature.action() != null && this.isEnabled(feature.action());
			int focusIndex = BUTTON_ACTIONS.length + LINKS.length + FEATURE_BUTTONS.length + index - 1;
			boolean focused = this.keyboardFocus && this.focus == focusIndex && enabled;
			float response = Math.max(this.featureHover[FEATURE_BUTTONS.length + index], focused ? 1.0F : 0.0F);
			this.drawFeatureTile(graphics, feature, x, y, 16, enabled, focused, response, opacity);
		}
	}

	private static FeatureButton feature(String texture, Action action, String label) {
		return new FeatureButton(Identifier.fromNamespaceAndPath("odissey", "textures/gui/features/" + texture + ".png"), action, label);
	}

	private static int featureX(int index) {
		int gap = 6;
		if (index < 6) {
			int start = (DESIGN_WIDTH - (6 * FEATURE_ICON_SIZE + 5 * gap)) / 2;
			return start + index * (FEATURE_ICON_SIZE + gap);
		}
		int start = (DESIGN_WIDTH - (3 * FEATURE_ICON_SIZE + 2 * gap)) / 2;
		return start + (index - 6) * (FEATURE_ICON_SIZE + gap);
	}

	private static int featureY(int index) {
		return index < 6 ? 140 : 163;
	}

	private static int utilityX(int index) {
		return 24 + index * 20;
	}

	private void drawFeatureTile(
		GuiGraphics graphics,
		FeatureButton feature,
		int x,
		int y,
		int size,
		boolean enabled,
		boolean focused,
		float response,
		float opacity
	) {
		if (response > 0.02F) {
			UiDraw.fillRounded(graphics, x - 1, y - 1, size + 2, size + 2, 5, OdisseyText.alpha(0x505AA9D5, opacity * response));
		}
		graphics.blit(
			RenderPipelines.GUI_TEXTURED,
			feature.texture(),
			x,
			y,
			0.0F,
			0.0F,
			size,
			size,
			FEATURE_ICON_TEXTURE_SIZE,
			FEATURE_ICON_TEXTURE_SIZE,
			FEATURE_ICON_TEXTURE_SIZE,
			FEATURE_ICON_TEXTURE_SIZE,
			OdisseyText.alpha(0xFFFFFFFF, opacity * (enabled ? 1.0F : 0.45F))
		);
		if (focused) {
			UiDraw.outline(graphics, x - 1, y - 1, size + 2, size + 2, OdisseyText.alpha(0xFF91D5FF, opacity));
		}
	}

	private void drawButton(
		GuiGraphics graphics,
		int index,
		int x,
		int y,
		int width,
		int height,
		boolean enabled,
		boolean pressed,
		boolean focused,
		float response,
		float opacity
	) {
		int top = y + (pressed ? 1 : 0);
		if (response > 0.02F) {
			UiDraw.fillRounded(
				graphics,
				x - 1,
				top - 1,
				width + 2,
				height + 2,
				Math.max(4, height / 2),
				OdisseyText.alpha(0x2EE7BE4A, opacity * response * response)
			);
		}
		int[] textureSize = BUTTON_TEXTURE_SIZES[index];
		graphics.blit(
			RenderPipelines.GUI_TEXTURED,
			BUTTON_TEXTURES[index],
			x,
			top,
			0.0F,
			0.0F,
			width,
			height,
			textureSize[0],
			textureSize[1],
			textureSize[0],
			textureSize[1],
			OdisseyText.alpha(0xFFFFFFFF, opacity * (enabled ? 1.0F : 0.58F))
		);

		if (focused) {
			UiDraw.outline(
			graphics,
				x - 1,
				top - 1,
				width + 2,
				height + 2,
				OdisseyText.alpha(GOLD_SOFT, opacity * 0.85F)
			);
		}
	}

	private void drawDock(GuiGraphics graphics, Layout layout, double mouseX, double mouseY, float opacity) {
		int size = layout.dockIconSize();
		int y = layout.dockY();
		for (int index = 0; index < LINKS.length; index++) {
			Link link = LINKS[index];
			int x = this.linkX(index, layout);
			boolean focused = this.keyboardFocus && this.focus == index + BUTTON_ACTIONS.length;
			float response = Math.max(this.linkHover[index], focused ? 1.0F : 0.0F);
			boolean pressed = this.pending == link.action();

			if (response > 0.01F) {
				UiDraw.fillRounded(
					graphics,
					x,
					y,
					size,
					size,
					size / 2,
					OdisseyText.alpha(0x30FFFFFF, opacity * response)
				);
			}

			int iconColor = mix(MUTED, 0xFFFFFFFF, Math.max(response, pressed ? 1.0F : 0.0F));
			int iconX = x + (size - 10) / 2;
			int iconY = y + (size - 10) / 2 + (pressed ? 1 : 0);
			drawDockIcon(graphics, index, iconX, iconY, OdisseyText.alpha(iconColor, opacity));

			if (response > 0.02F) {
				int labelWidth = OdisseyText.smallWidth(this.font, link.label());
				int labelX = Math.round(x + (size - labelWidth) / 2.0F);
				int labelY = y - 12;
				OdisseyText.drawSmall(graphics, this.font, link.label(), labelX + 1, labelY + 1, OdisseyText.alpha(0xB0000000, opacity * response));
				OdisseyText.drawSmall(graphics, this.font, link.label(), labelX, labelY, OdisseyText.alpha(WHITE, opacity * response));
			}
		}
	}

	private void drawFooter(GuiGraphics graphics, Layout layout, float opacity) {
		int x = layout.margin();
		String client = "ODISSEY CLIENT" + (this.clientVersion.isBlank() ? "" : "  " + this.clientVersion);
		OdisseyText.tracked(graphics, this.font, client, x, layout.footerY(), OdisseyText.alpha(MUTED, opacity * 0.72F), 0);

		if (layout.showMetadata()) {
			String metadata = "Minecraft " + this.minecraftVersion;
			if (!this.loaderVersion.isBlank()) {
			metadata += "  ·  Fabric " + this.loaderVersion;
			}
			int metadataWidth = OdisseyText.smallWidth(this.font, metadata);
			OdisseyText.drawSmall(
				graphics,
				this.font,
				metadata,
				Math.round((DESIGN_WIDTH - metadataWidth) / 2.0F),
				layout.footerY(),
				OdisseyText.alpha(MUTED, opacity * 0.72F)
			);
		}

		if (layout.showDisclaimer()) {
			OdisseyText.right(
				graphics,
				this.font,
				"No afiliado a Mojang ni Microsoft",
				DESIGN_WIDTH - layout.margin(),
				layout.footerY(),
				OdisseyText.alpha(DIM, opacity * 0.88F)
			);
		}
	}

	private void drawDisabledTooltip(GuiGraphics graphics, Layout layout, int screenX, int screenY, double mouseX, double mouseY) {
		for (int index = 0; index < BUTTON_ACTIONS.length; index++) {
			Component reason = this.disabledReason(BUTTON_ACTIONS[index]);
			if (reason != null && inside(mouseX, mouseY, layout.buttonX(index), layout.buttonY(index), layout.buttonWidth(index), layout.buttonHeight(index))) {
				graphics.setTooltipForNextFrame(reason, screenX, screenY);
				return;
			}
		}
		for (int index = 0; index < FEATURE_BUTTONS.length + UTILITY_BUTTONS.length; index++) {
			FeatureButton feature = index < FEATURE_BUTTONS.length
				? FEATURE_BUTTONS[index]
				: UTILITY_BUTTONS[index - FEATURE_BUTTONS.length];
			int x = index < FEATURE_BUTTONS.length ? featureX(index) : utilityX(index - FEATURE_BUTTONS.length);
			int y = index < FEATURE_BUTTONS.length ? featureY(index) : 14;
			int size = index < FEATURE_BUTTONS.length ? FEATURE_ICON_SIZE : 16;
			if (inside(mouseX, mouseY, x, y, size, size)) {
				Component message = feature.action() == null ? Component.literal(feature.label()) : this.disabledReason(feature.action());
				graphics.setTooltipForNextFrame(message == null ? Component.literal(feature.label()) : message, screenX, screenY);
				return;
			}
		}
	}

	private void updateHover(double mouseX, double mouseY) {
		long now = Util.getMillis();
		float delta = this.lastFrame == 0L ? 1.0F / 60.0F : Math.min(0.05F, (now - this.lastFrame) / 1000.0F);
		this.lastFrame = now;
		Layout layout = this.layout();
		for (int index = 0; index < BUTTON_ACTIONS.length; index++) {
			boolean hovered = this.isEnabled(BUTTON_ACTIONS[index])
				&& this.pending == null
				&& inside(mouseX, mouseY, layout.buttonX(index), layout.buttonY(index), layout.buttonWidth(index), layout.buttonHeight(index));
			this.buttonHover[index] = this.approach(this.buttonHover[index], hovered ? 1.0F : 0.0F, delta);
		}
		for (int index = 0; index < FEATURE_BUTTONS.length + UTILITY_BUTTONS.length; index++) {
			FeatureButton feature = index < FEATURE_BUTTONS.length
				? FEATURE_BUTTONS[index]
				: UTILITY_BUTTONS[index - FEATURE_BUTTONS.length];
			int x = index < FEATURE_BUTTONS.length ? featureX(index) : utilityX(index - FEATURE_BUTTONS.length);
			int y = index < FEATURE_BUTTONS.length ? featureY(index) : 14;
			int size = index < FEATURE_BUTTONS.length ? FEATURE_ICON_SIZE : 16;
			boolean hovered = feature.action() != null && this.isEnabled(feature.action()) && this.pending == null && inside(mouseX, mouseY, x, y, size, size);
			this.featureHover[index] = this.approach(this.featureHover[index], hovered ? 1.0F : 0.0F, delta);
		}

		int size = layout.dockIconSize();
		for (int index = 0; index < LINKS.length; index++) {
			int x = this.linkX(index, layout);
			boolean hovered = this.pending == null && inside(mouseX, mouseY, x, layout.dockY(), size, size);
			this.linkHover[index] = this.approach(this.linkHover[index], hovered ? 1.0F : 0.0F, delta);
		}
	}

	private int linkX(int index, Layout layout) {
		int total = LINKS.length * layout.dockIconSize() + (LINKS.length - 1) * layout.dockGap();
		int start = Math.round((DESIGN_WIDTH - total) / 2.0F);
		return start + index * (layout.dockIconSize() + layout.dockGap());
	}

	private float approach(float current, float target, float delta) {
		float factor = 1.0F - (float)Math.exp(-14.0F * delta);
		return Mth.lerp(factor, current, target);
	}

	private float introOpacity() {
		float progress = Mth.clamp((Util.getMillis() - this.openedAt) / (float)INTRO_MS, 0.0F, 1.0F);
		float inverse = 1.0F - progress;
		return 1.0F - inverse * inverse * inverse;
	}

	private boolean isEnabled(Action action) {
		return this.disabledReason(action) == null;
	}

	private Component disabledReason(Action action) {
		return switch (action) {
			case MULTIPLAYER -> this.multiplayerDisabled;
			case STORE -> STORE_URL.isBlank() ? Component.literal("Tienda no configurada") : null;
			case DISCORD -> DISCORD_URL.isBlank() ? Component.literal("Discord no configurado") : null;
			default -> null;
		};
	}

	private static void openLink(String url) {
		if (url == null || url.isBlank()) {
			return;
		}
		try {
			Util.getPlatform().openUri(url);
		} catch (RuntimeException exception) {
			com.odissey.client.OdisseyClient.LOGGER.error("No se pudo abrir el enlace de Odissey: {}", url, exception);
		}
	}

	private Component multiplayerDisabledReason() {
		if (this.minecraft.allowsMultiplayer()) {
			return null;
		}
		if (this.minecraft.isNameBanned()) {
			return Component.translatable("title.multiplayer.disabled.banned.name");
		}
		BanDetails ban = this.minecraft.multiplayerBan();
		if (ban != null) {
			return Component.translatable(
				ban.expires() != null ? "title.multiplayer.disabled.banned.temporary" : "title.multiplayer.disabled.banned.permanent"
			);
		}
		return Component.translatable("title.multiplayer.disabled");
	}

	private static String modVersion(String id) {
		return FabricLoader.getInstance()
			.getModContainer(id)
			.map(container -> container.getMetadata().getVersion().getFriendlyString())
			.orElse("");
	}

	@Override
	public void mouseMoved(double mouseX, double mouseY) {
		this.keyboardFocus = false;
		super.mouseMoved(mouseX, mouseY);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (event.button() != 0 || this.pending != null) {
			return super.mouseClicked(event, doubleClick);
		}

		Layout layout = this.layout();
		for (int index = 0; index < BUTTON_ACTIONS.length; index++) {
			if (inside(event.x(), event.y(), layout.buttonX(index), layout.buttonY(index), layout.buttonWidth(index), layout.buttonHeight(index))) {
				this.keyboardFocus = false;
				if (this.isEnabled(BUTTON_ACTIONS[index])) {
					this.queue(BUTTON_ACTIONS[index]);
				}
				return true;
			}
		}
		for (int index = 0; index < FEATURE_BUTTONS.length; index++) {
			FeatureButton feature = FEATURE_BUTTONS[index];
			if (inside(event.x(), event.y(), featureX(index), featureY(index), FEATURE_ICON_SIZE, FEATURE_ICON_SIZE)) {
				this.keyboardFocus = false;
				if (feature.action() != null && this.isEnabled(feature.action())) {
					this.queue(feature.action());
				}
				return true;
			}
		}
		for (int index = 0; index < UTILITY_BUTTONS.length; index++) {
			FeatureButton feature = UTILITY_BUTTONS[index];
			if (inside(event.x(), event.y(), utilityX(index), 14, 16, 16)) {
				this.keyboardFocus = false;
				if (feature.action() != null && this.isEnabled(feature.action())) {
					this.queue(feature.action());
				}
				return true;
			}
		}

		int size = layout.dockIconSize();
		for (int index = 0; index < LINKS.length; index++) {
			int x = this.linkX(index, layout);
			if (inside(event.x(), event.y(), x, layout.dockY(), size, size)) {
				this.keyboardFocus = false;
				this.queue(LINKS[index].action());
				return true;
			}
		}

		this.keyboardFocus = false;
		return super.mouseClicked(event, doubleClick);
	}

	@Override
	public boolean keyPressed(KeyEvent event) {
		if (event.isEscape() && this.pending != null) {
			this.pending = null;
			return true;
		}

		if (event.isCycleFocus()) {
			this.keyboardFocus = true;
			this.moveFocus(event.hasShiftDown() ? -1 : 1, true);
			return true;
		}

		if (event.isUp() || event.isDown()) {
			this.keyboardFocus = true;
			this.moveFocus(event.isUp() ? -1 : 1, false);
			return true;
		}

		if (event.isSelection()) {
			this.keyboardFocus = true;
			Action action = FOCUS_ORDER[this.focus];
			if (this.isEnabled(action)) {
				this.queue(action);
			}
			return true;
		}

		if (event.key() == GLFW.GLFW_KEY_ESCAPE) {
			return true;
		}

		return super.keyPressed(event);
	}

	private void moveFocus(int direction, boolean includeLinks) {
		if (!includeLinks && this.focus >= BUTTON_ACTIONS.length) {
			this.focus = direction > 0 ? 0 : BUTTON_ACTIONS.length - 1;
		}

		for (int step = 1; step <= FOCUS_ORDER.length; step++) {
			int candidate = Math.floorMod(this.focus + direction * step, FOCUS_ORDER.length);
			if (!includeLinks && candidate >= BUTTON_ACTIONS.length) {
				continue;
			}
			if (this.isEnabled(FOCUS_ORDER[candidate])) {
				this.focus = candidate;
				return;
			}
		}
	}

	private void queue(Action action) {
		if (this.pending == null && this.isEnabled(action)) {
			this.pending = action;
			this.pressedAt = Util.getMillis();
		}
	}

	private void activate(Action action) {
		if (!this.isEnabled(action)) {
			return;
		}
		switch (action) {
			case SINGLEPLAYER -> this.minecraft.setScreen(new SelectWorldScreen(this));
			case MULTIPLAYER -> {
				Screen screen = this.minecraft.options.skipMultiplayerWarning ? new JoinMultiplayerScreen(this) : new SafetyScreen(this);
				this.minecraft.setScreen(screen);
			}
			case STORE -> openLink(STORE_URL);
			case DISCORD -> openLink(DISCORD_URL);
			case OPTIONS -> this.minecraft.setScreen(new OptionsScreen(this, this.minecraft.options));
			case ACCESSIBILITY -> this.minecraft.setScreen(new AccessibilityOptionsScreen(this, this.minecraft.options));
			case LANGUAGE -> this.minecraft.setScreen(new LanguageSelectScreen(this, this.minecraft.options, this.minecraft.getLanguageManager()));
			case CREDITS -> this.minecraft.setScreen(new CreditsAndAttributionScreen(this));
			case QUIT -> this.minecraft.stop();
		}
	}

	@Override
	public boolean shouldCloseOnEsc() {
		return false;
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void onClose() {
	}

	private Layout layout() {
		int margin = 24;
		int brandY = 45;
		int emblemSize = 20;
		int buttonWidth = 108;
		int buttonHeight = 15;
		int buttonGap = 8;
		int footerY = 250;
		int dockIconSize = 20;
		int dockGap = 16;
		int dockY = footerY - 36 - dockIconSize;
		int menuY = 98;
		int menuX = (DESIGN_WIDTH - (buttonWidth * 2 + buttonGap)) / 2;

		return new Layout(
			margin,
			emblemSize,
			brandY,
			menuX,
			buttonWidth,
			menuY,
			buttonHeight,
			buttonGap,
			dockIconSize,
			dockGap,
			dockY,
			footerY,
			true,
			true,
			true
		);
	}

	private void drawCover(
		GuiGraphics graphics,
		Identifier texture,
		int textureWidth,
		int textureHeight,
		int x,
		int y,
		int width,
		int height
	) {
		float u0 = 0.0F;
		float u1 = 1.0F;
		float v0 = 0.0F;
		float v1 = 1.0F;
		double screenAspect = width / (double)height;
		double textureAspect = textureWidth / (double)textureHeight;
		if (screenAspect > textureAspect) {
			float span = (float)(textureAspect / screenAspect);
			v0 = (1.0F - span) / 2.0F;
			v1 = v0 + span;
		} else {
			float span = (float)(screenAspect / textureAspect);
			u0 = (1.0F - span) / 2.0F;
			u1 = u0 + span;
		}
		graphics.blit(texture, x, y, width, height, u0, u1, v0, v1);
	}

	private static int mix(int from, int to, float amount) {
		float value = Mth.clamp(amount, 0.0F, 1.0F);
		int a = Math.round(Mth.lerp(value, from >>> 24, to >>> 24));
		int r = Math.round(Mth.lerp(value, from >> 16 & 0xFF, to >> 16 & 0xFF));
		int g = Math.round(Mth.lerp(value, from >> 8 & 0xFF, to >> 8 & 0xFF));
		int b = Math.round(Mth.lerp(value, from & 0xFF, to & 0xFF));
		return a << 24 | r << 16 | g << 8 | b;
	}

	private static void drawMenuIcon(GuiGraphics graphics, int index, int x, int y, int color) {
		switch (index) {
			case 0 -> drawPlayIcon(graphics, x, y, color);
			case 1 -> drawGlobeIcon(graphics, x, y, color);
			case 2 -> drawBagIcon(graphics, x, y, color);
			default -> drawChatIcon(graphics, x, y, color);
		}
	}

	private static void drawDockIcon(GuiGraphics graphics, int index, int x, int y, int color) {
		Identifier icon = DOCK_ICONS[Math.max(0, Math.min(index, DOCK_ICONS.length - 1))];
		int size = 12;
		graphics.blit(
			RenderPipelines.GUI_TEXTURED,
			icon,
			x - 1,
			y - 1,
			0.0F,
			0.0F,
			size,
			size,
			DOCK_ICON_TEXTURE_SIZE,
			DOCK_ICON_TEXTURE_SIZE,
			DOCK_ICON_TEXTURE_SIZE,
			DOCK_ICON_TEXTURE_SIZE,
			color
		);
	}

	private static void drawPlayIcon(GuiGraphics graphics, int x, int y, int color) {
		for (int row = 0; row < 10; row++) {
			int half = Math.min(row, 9 - row);
			graphics.fill(x, y + row, x + 1 + half, y + row + 1, color);
		}
	}

	private static void drawGlobeIcon(GuiGraphics graphics, int x, int y, int color) {
		drawRing(graphics, x + 5, y + 5, 4, color, 0.0F, 360.0F);
		drawEllipse(graphics, x + 5, y + 5, 1.7F, 4.0F, color);
		graphics.fill(x + 1, y + 5, x + 10, y + 6, color);
	}

	private static void drawBagIcon(GuiGraphics graphics, int x, int y, int color) {
		graphics.fill(x + 2, y + 4, x + 10, y + 5, color);
		graphics.fill(x + 2, y + 4, x + 3, y + 10, color);
		graphics.fill(x + 9, y + 4, x + 10, y + 10, color);
		graphics.fill(x + 2, y + 9, x + 10, y + 10, color);
		graphics.fill(x + 4, y + 2, x + 8, y + 3, color);
		graphics.fill(x + 4, y + 2, x + 5, y + 4, color);
		graphics.fill(x + 7, y + 2, x + 8, y + 4, color);
		graphics.fill(x + 5, y + 6, x + 7, y + 8, color);
	}

	private static void drawChatIcon(GuiGraphics graphics, int x, int y, int color) {
		UiDraw.fillRounded(graphics, x + 1, y + 2, 9, 6, 2, color);
		graphics.fill(x + 3, y + 7, x + 5, y + 10, color);
		graphics.fill(x + 4, y + 6, x + 5, y + 8, color);
	}

	private static void drawSlidersIcon(GuiGraphics graphics, int x, int y, int color) {
		for (int row = 0; row < 3; row++) {
			int lineY = y + row * 4;
			graphics.fill(x, lineY, x + 10, lineY + 1, color);
			int knob = row == 0 ? 6 : row == 1 ? 2 : 7;
			graphics.fill(x + knob, lineY - 1, x + knob + 2, lineY + 2, color);
		}
	}

	private static void drawAccessibilityIcon(GuiGraphics graphics, int x, int y, int color) {
		drawRing(graphics, x + 5, y + 1, 2, color, 0.0F, 360.0F);
		graphics.fill(x + 4, y + 3, x + 6, y + 7, color);
		graphics.fill(x, y + 4, x + 10, y + 5, color);
		graphics.fill(x + 1, y + 9, x + 4, y + 10, color);
		graphics.fill(x + 6, y + 9, x + 9, y + 10, color);
		graphics.fill(x + 3, y + 8, x + 4, y + 10, color);
		graphics.fill(x + 6, y + 8, x + 7, y + 10, color);
	}

	private static void drawInfoIcon(GuiGraphics graphics, int x, int y, int color) {
		drawRing(graphics, x + 5, y + 5, 4, color, 0.0F, 360.0F);
		graphics.fill(x + 4, y + 4, x + 6, y + 6, color);
		graphics.fill(x + 4, y + 7, x + 6, y + 10, color);
	}

	private static void drawPowerIcon(GuiGraphics graphics, int x, int y, int color) {
		drawRing(graphics, x + 5, y + 5, 4, color, -60.0F, 240.0F);
		graphics.fill(x + 5, y, x + 6, y + 6, color);
	}

	private static void drawChevron(GuiGraphics graphics, int x, int y, int color) {
		for (int step = 0; step < 4; step++) {
			graphics.fill(x + step, y + step, x + step + 1, y + step + 1, color);
			graphics.fill(x + step, y + 6 - step, x + step + 1, y + 7 - step, color);
		}
	}

	private static void drawRing(GuiGraphics graphics, int cx, int cy, int radius, int color, float startDegrees, float sweepDegrees) {
		int steps = Math.max(12, radius * 8);
		for (int step = 0; step < steps; step++) {
			double angle = Math.toRadians(startDegrees + sweepDegrees * step / (double)steps);
			int x = cx + (int)Math.round(Math.cos(angle) * radius);
			int y = cy + (int)Math.round(Math.sin(angle) * radius);
			graphics.fill(x, y, x + 1, y + 1, color);
		}
	}

	private static void drawEllipse(GuiGraphics graphics, int cx, int cy, float radiusX, float radiusY, int color) {
		int steps = 24;
		for (int step = 0; step < steps; step++) {
			double angle = Math.PI * 2.0 * step / steps;
			int x = cx + (int)Math.round(Math.cos(angle) * radiusX);
			int y = cy + (int)Math.round(Math.sin(angle) * radiusY);
			graphics.fill(x, y, x + 1, y + 1, color);
		}
	}

	private static boolean inside(double mouseX, double mouseY, int x, int y, int width, int height) {
		return mouseX >= x && mouseX < x + width && mouseY >= y && mouseY < y + height;
	}

	private enum Action {
		SINGLEPLAYER,
		MULTIPLAYER,
		STORE,
		DISCORD,
		OPTIONS,
		ACCESSIBILITY,
		LANGUAGE,
		CREDITS,
		QUIT
	}

	private record Link(Action action, String label) {
	}

	private record FeatureButton(Identifier texture, Action action, String label) {
	}

	private record Layout(
		int margin,
		int emblemSize,
		int brandY,
		int menuX,
		int buttonWidth,
		int menuY,
		int buttonHeight,
		int buttonGap,
		int dockIconSize,
		int dockGap,
		int dockY,
		int footerY,
		boolean showAccount,
		boolean showMetadata,
		boolean showDisclaimer
	) {
		int buttonX(int index) {
			if (index < 2) {
				return this.menuX + index * (this.buttonWidth + this.buttonGap);
			}
			int smallWidth = this.buttonWidth(index);
			int smallGroupWidth = smallWidth * 2 + this.buttonGap;
			return (DESIGN_WIDTH - smallGroupWidth) / 2 + (index - 2) * (smallWidth + this.buttonGap);
		}

		int buttonY(int index) {
			return this.menuY + (index < 2 ? 0 : this.buttonHeight + 4);
		}

		int buttonWidth(int index) {
			return index < 2 ? this.buttonWidth : Math.round(this.buttonWidth * 205.0F / 462.0F);
		}

		int buttonHeight(int index) {
			return index < 2 ? this.buttonHeight : Math.round(this.buttonHeight * 36.0F / 62.0F);
		}
	}
}


