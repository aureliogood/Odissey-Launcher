package com.odissey.client.ui;

import com.mojang.authlib.GameProfile;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.resources.DefaultPlayerSkin;
import net.minecraft.util.Mth;
import net.minecraft.util.Util;
import net.minecraft.world.entity.player.PlayerModelType;
import net.minecraft.world.entity.player.PlayerSkin;
import org.jspecify.annotations.Nullable;

final class OdisseyPlayerPreview {
	private static final float MODEL_HEIGHT = 2.125F;
	private static final float FIT_SCALE = 0.97F;
	private static final float PIVOT_Y = -1.0625F;
	private static final float PITCH_LIMIT = 35.0F;
	private static final float MIN_ZOOM = 0.84F;
	private static final float MAX_ZOOM = 1.15F;
	private static final int GOLD = 0xFFF2C94C;
	private static final int WHITE = 0xFFF6F1E7;
	private static final int MUTED = 0xFFB7B0A4;
	private static final int DIM = 0xFF817B72;
	private static final int GREEN = 0xFF7DD8A2;

	private final Minecraft minecraft;
	private final @Nullable GameProfile profile;
	private final Supplier<PlayerSkin> skinLookup;
	private final CompletableFuture<Optional<PlayerSkin>> skinFuture;
	private final boolean hasTextureProperty;
	private final PlayerModel wideModel;
	private final PlayerModel slimModel;

	private float rotationX = -5.0F;
	private float rotationY = 28.0F;
	private float zoom = 1.0F;
	private boolean dragging;
	private long lastInteraction = Util.getMillis();
	private long lastUpdate = Util.getMillis();
	private int cardX;
	private int cardY;
	private int cardWidth;
	private int cardHeight;
	private int previewX;
	private int previewY;
	private int previewWidth;
	private int previewHeight;
	private boolean compactCard;

	OdisseyPlayerPreview(Minecraft minecraft) {
		this.minecraft = minecraft;
		GameProfile gameProfile = minecraft.getGameProfile();
		this.profile = gameProfile;
		if (gameProfile != null) {
			this.skinFuture = minecraft.getSkinManager().get(gameProfile);
			this.skinLookup = minecraft.getSkinManager().createLookup(gameProfile, false);
			this.hasTextureProperty = !gameProfile.properties().get("textures").isEmpty();
		} else {
			PlayerSkin fallback = DefaultPlayerSkin.getDefaultSkin();
			this.skinFuture = CompletableFuture.completedFuture(Optional.of(fallback));
			this.skinLookup = () -> fallback;
			this.hasTextureProperty = false;
		}
		this.wideModel = new PlayerModel(minecraft.getEntityModels().bakeLayer(ModelLayers.PLAYER), false);
		this.slimModel = new PlayerModel(minecraft.getEntityModels().bakeLayer(ModelLayers.PLAYER_SLIM), true);
	}

	void update(long now) {
		float delta = this.lastUpdate == 0L ? 1.0F / 60.0F : Math.min(0.05F, (now - this.lastUpdate) / 1000.0F);
		this.lastUpdate = now;
		if (!this.dragging && now - this.lastInteraction > 4500L) {
			this.rotationY = wrap(this.rotationY + delta * 3.1F);
		}
	}

	void draw(GuiGraphics graphics, int x, int y, int width, int height, double mouseX, double mouseY, float opacity, long now) {
		this.cardX = x;
		this.cardY = y;
		this.cardWidth = width;
		this.cardHeight = height;
		this.compactCard = height < 240 || width < 190;
		int stageTop = this.compactCard ? 30 : 36;
		int identityHeight = this.compactCard ? 50 : 68;
		this.previewX = x + 12;
		this.previewY = y + stageTop;
		this.previewWidth = Math.max(0, width - 24);
		this.previewHeight = Math.max(0, height - stageTop - identityHeight);

		int radius = Math.max(8, Math.min(12, Math.min(width, height) / 12));
		UiDraw.fillRounded(graphics, x + 2, y + 7, width, height, radius, OdisseyText.alpha(0x66000000, opacity));
		UiDraw.fillRounded(graphics, x - 1, y - 1, width + 2, height + 2, radius + 1, OdisseyText.alpha(0x30F2C94C, opacity));
		UiDraw.fillRounded(graphics, x, y, width, height, radius, OdisseyText.alpha(0xD90A0B0E, opacity));
		UiDraw.fillRounded(graphics, x + 1, y + 1, width - 2, 1, 0, OdisseyText.alpha(0x1FFFFFFF, opacity));

		int accentWidth = Math.max(32, Math.min(58, width / 5));
		UiDraw.fillRounded(graphics, x + 16, y, accentWidth, 2, 1, OdisseyText.alpha(GOLD, opacity));
		UiDraw.fillRounded(graphics, x + 18, y, 1, height - 2, 0, OdisseyText.alpha(0x16F2C94C, opacity));

		String stageLabel = this.compactCard ? "VISTA 3D" : "VISTA PREVIA";
		OdisseyText.tracked(graphics, this.minecraft.font, stageLabel, x + 16, y + 16, OdisseyText.alpha(GOLD, opacity * 0.9F), 1);

		String badge = this.accountTag();
		int badgeWidth = OdisseyText.smallWidth(this.minecraft.font, badge) + 14;
		int badgeX = x + width - badgeWidth - 16;
		UiDraw.fillRounded(graphics, badgeX, y + 12, badgeWidth, 14, 7, OdisseyText.alpha(0x24FFFFFF, opacity));
		OdisseyText.drawSmall(
			graphics,
			this.minecraft.font,
			badge,
			badgeX + 7,
			y + 15,
			OdisseyText.alpha(this.hasTextureProperty ? GREEN : MUTED, opacity)
		);

		this.drawStage(graphics, mouseX, mouseY, opacity, now);
		this.drawIdentity(graphics, opacity, now);
	}

	private void drawStage(GuiGraphics graphics, double mouseX, double mouseY, float opacity, long now) {
		if (this.previewWidth <= 0 || this.previewHeight <= 0) {
			return;
		}

		UiDraw.fillRounded(
			graphics,
			this.previewX,
			this.previewY,
			this.previewWidth,
			this.previewHeight,
			8,
			OdisseyText.alpha(0x5C000000, opacity)
		);
		UiDraw.fillRounded(
			graphics,
			this.previewX + 1,
			this.previewY + 1,
			this.previewWidth - 2,
			this.previewHeight - 2,
			7,
			OdisseyText.alpha(0x18000000, opacity)
		);

		int centerX = this.previewX + this.previewWidth / 2;
		int glowY = this.previewY + Math.round(this.previewHeight * 0.48F);
		int glowX = Math.round(this.previewWidth * 0.36F);
		int glowYRadius = Math.round(this.previewHeight * 0.4F);
		drawEllipse(graphics, centerX, glowY, glowX, glowYRadius, 0xFFF2C94C, opacity * 0.08F);
		drawEllipse(graphics, centerX, glowY, Math.round(glowX * 0.7F), Math.round(glowYRadius * 0.7F), 0xFFFFDF7A, opacity * 0.06F);
		drawRing(graphics, centerX, glowY, Math.round(Math.min(this.previewWidth, this.previewHeight) * 0.34F), OdisseyText.alpha(0x44F2C94C, opacity * 0.62F));
		drawRing(
			graphics,
			centerX,
			glowY,
			Math.round(Math.min(this.previewWidth, this.previewHeight) * 0.42F),
			OdisseyText.alpha(0x1FF2C94C, opacity * 0.55F)
		);

		int groundWidth = Math.round(this.previewWidth * 0.22F);
		int groundY = this.previewY + Math.round(this.previewHeight * 0.91F);
		drawEllipse(graphics, centerX, groundY, groundWidth, Math.max(3, this.previewHeight / 42), 0xFF000000, opacity * 0.38F);

		PlayerSkin skin = this.skinLookup.get();
		if (skin == null) {
			skin = DefaultPlayerSkin.getDefaultSkin();
		}
		PlayerModel model = skin.model() == PlayerModelType.SLIM ? this.slimModel : this.wideModel;
		this.applyPose(model, now);

		float baseScale = FIT_SCALE * this.previewHeight / MODEL_HEIGHT;
		graphics.submitSkinRenderState(
			model,
			skin.body().texturePath(),
			baseScale * this.zoom,
			this.rotationX,
			this.rotationY,
			PIVOT_Y,
			this.previewX,
			this.previewY,
			this.previewX + this.previewWidth,
			this.previewY + this.previewHeight
		);

		graphics.fillGradient(
			this.previewX,
			this.previewY + this.previewHeight - Math.min(52, this.previewHeight / 3),
			this.previewX + this.previewWidth,
			this.previewY + this.previewHeight,
			0x00000000,
			OdisseyText.alpha(0x99000000, opacity)
		);

		if (!this.skinFuture.isDone()) {
			graphics.fill(this.previewX, this.previewY, this.previewX + this.previewWidth, this.previewY + this.previewHeight, OdisseyText.alpha(0x33000000, opacity));
			String loading = "Cargando perfil";
			OdisseyText.center(
				graphics,
				this.minecraft.font,
				loading,
				centerX,
				this.previewY + this.previewHeight - 18,
				OdisseyText.alpha(WHITE, opacity * 0.76F)
			);
		}

		boolean hovered = this.isOverPreview(mouseX, mouseY);
		int outline = hovered || this.dragging ? 0x66F2C94C : 0x18FFFFFF;
		UiDraw.outline(graphics, this.previewX, this.previewY, this.previewWidth, this.previewHeight, OdisseyText.alpha(outline, opacity));
	}

	private void drawIdentity(GuiGraphics graphics, float opacity, long now) {
		int x = this.cardX + 16;
		int width = this.cardWidth - 32;
		int separatorY = this.cardY + this.cardHeight - (this.compactCard ? 44 : 66);
		graphics.fill(x, separatorY, x + width, separatorY + 1, OdisseyText.alpha(0x1FFFFFFF, opacity));

		String name = this.displayName();
		int nameY = this.cardY + this.cardHeight - (this.compactCard ? 38 : 53);
		if (this.compactCard) {
			OdisseyText.drawStrong(graphics, this.minecraft.font, name, x, nameY + 1, OdisseyText.alpha(WHITE, opacity));
		} else {
			OdisseyText.drawTitle(graphics, this.minecraft.font, name, x, nameY, OdisseyText.alpha(WHITE, opacity));
		}

		String tag = this.hasTextureProperty ? "ONLINE" : "LOCAL";
		int tagColor = this.hasTextureProperty ? GREEN : MUTED;
		int tagWidth = OdisseyText.smallWidth(this.minecraft.font, tag) + 12;
		int tagX = this.cardX + this.cardWidth - 16 - tagWidth;
		int tagY = this.cardY + this.cardHeight - (this.compactCard ? 39 : 52);
		UiDraw.fillRounded(graphics, tagX, tagY, tagWidth, 13, 6, OdisseyText.alpha(0x24FFFFFF, opacity));
		OdisseyText.drawSmall(graphics, this.minecraft.font, tag, tagX + 6, tagY + 3, OdisseyText.alpha(tagColor, opacity));

		OdisseyText.drawSmall(
			graphics,
			this.minecraft.font,
			this.statusText(now),
			x,
			this.cardY + this.cardHeight - (this.compactCard ? 23 : 34),
			OdisseyText.alpha(this.statusColor(now), opacity * 0.9F)
		);
		if (!this.compactCard) {
			OdisseyText.drawSmall(
				graphics,
				this.minecraft.font,
				"Arrastra para girar  ·  Rueda para zoom",
				x,
				this.cardY + this.cardHeight - 19,
				OdisseyText.alpha(DIM, opacity * 0.95F)
			);
		}
	}

	private void applyPose(PlayerModel model, long now) {
		float seconds = now / 1000.0F;
		model.head.yRot = Mth.sin(seconds * 0.72F) * 0.055F;
		model.head.xRot = -0.025F + Mth.sin(seconds * 0.93F) * 0.018F;
		model.rightArm.zRot = 0.026F + Mth.sin(seconds * 0.8F) * 0.012F;
		model.leftArm.zRot = -0.026F - Mth.sin(seconds * 0.8F) * 0.012F;
	}

	private String statusText(long now) {
		if (!this.skinFuture.isDone()) {
			int dots = (int)((now / 420L) % 4L);
			return this.compactCard ? "Cargando" + ".".repeat(dots) : "Cargando skin" + ".".repeat(dots);
		}
		if (this.hasTextureProperty) {
			return this.compactCard ? "Skin online" : "Skin de Minecraft cargada";
		}
		if (this.profile == null) {
			return "Apariencia predeterminada";
		}
		return this.compactCard ? "Perfil local" : "Perfil local · skin predeterminada";
	}

	private int statusColor(long now) {
		if (!this.skinFuture.isDone()) {
			return GOLD;
		}
		return this.hasTextureProperty ? GREEN : MUTED;
	}

	String displayName() {
		if (this.profile == null || this.profile.name() == null || this.profile.name().isBlank()) {
			return "Jugador";
		}
		return this.profile.name();
	}

	String accountTag() {
		return this.hasTextureProperty ? "ONLINE" : "LOCAL";
	}

	boolean hasTextureProperty() {
		return this.hasTextureProperty;
	}

	boolean isOverPreview(double mouseX, double mouseY) {
		return inside(mouseX, mouseY, this.previewX, this.previewY, this.previewWidth, this.previewHeight);
	}

	boolean isOverCard(double mouseX, double mouseY) {
		return inside(mouseX, mouseY, this.cardX, this.cardY, this.cardWidth, this.cardHeight);
	}

	boolean mouseClicked(double mouseX, double mouseY, boolean doubleClick) {
		if (!this.isOverPreview(mouseX, mouseY)) {
			return false;
		}
		this.lastInteraction = Util.getMillis();
		if (doubleClick) {
			this.reset();
		} else {
			this.dragging = true;
		}
		return true;
	}

	boolean mouseDragged(double deltaX, double deltaY) {
		if (!this.dragging) {
			return false;
		}
		this.rotationX = Mth.clamp(this.rotationX - (float)deltaY * 1.4F, -PITCH_LIMIT, PITCH_LIMIT);
		this.rotationY = wrap(this.rotationY + (float)deltaX * 1.15F);
		this.lastInteraction = Util.getMillis();
		return true;
	}

	void mouseReleased() {
		this.dragging = false;
		this.lastInteraction = Util.getMillis();
	}

	boolean mouseScrolled(double mouseX, double mouseY, double amount) {
		if (!this.isOverPreview(mouseX, mouseY)) {
			return false;
		}
		this.zoom = Mth.clamp(this.zoom + (float)amount * 0.055F, MIN_ZOOM, MAX_ZOOM);
		this.lastInteraction = Util.getMillis();
		return true;
	}

	void reset() {
		this.rotationX = -5.0F;
		this.rotationY = 28.0F;
		this.zoom = 1.0F;
		this.dragging = false;
		this.lastInteraction = Util.getMillis();
	}

	private static float wrap(float degrees) {
		float wrapped = degrees % 360.0F;
		return wrapped < 0.0F ? wrapped + 360.0F : wrapped;
	}

	private static void drawEllipse(GuiGraphics graphics, int centerX, int centerY, int radiusX, int radiusY, int color, float opacity) {
		if (radiusX <= 0 || radiusY <= 0) {
			return;
		}
		for (int row = -radiusY; row <= radiusY; row++) {
			float normalized = row / (float)radiusY;
			float span = (float)Math.sqrt(Math.max(0.0F, 1.0F - normalized * normalized));
			int half = Math.round(radiusX * span);
			float falloff = 1.0F - Math.abs(normalized);
			int alpha = Math.round((color >>> 24) * opacity * falloff * falloff);
			graphics.fill(centerX - half, centerY + row, centerX + half, centerY + row + 1, color & 0xFFFFFF | alpha << 24);
		}
	}

	private static void drawRing(GuiGraphics graphics, int centerX, int centerY, int radius, int color) {
		if (radius <= 0) {
			return;
		}
		int steps = Math.max(48, radius * 4);
		for (int step = 0; step < steps; step++) {
			double angle = Math.PI * 2.0 * step / steps;
			int x = centerX + (int)Math.round(Math.cos(angle) * radius);
			int y = centerY + (int)Math.round(Math.sin(angle) * radius * 0.42F);
			graphics.fill(x, y, x + 1, y + 1, color);
		}
	}

	private static boolean inside(double mouseX, double mouseY, int x, int y, int width, int height) {
		return width > 0 && height > 0 && mouseX >= x && mouseX < x + width && mouseY >= y && mouseY < y + height;
	}
}
