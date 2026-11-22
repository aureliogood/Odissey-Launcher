package com.odissey.client.ui;

import com.odissey.client.config.OdisseyConfig;
import com.odissey.client.hud.HudRenderer;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;

public final class HudEditorScreen extends Screen {
	private static final int GOLD = 0xFFF2C94C;
	private static final int MUTED = 0xFFA0A0A8;
	private static final int DIM = 0xFF6B6B73;

	private final OdisseyConfig config;
	private final HudRenderer hud;
	private final Screen parent;
	private DragTarget dragging = DragTarget.NONE;
	private double grabX;
	private double grabY;

	public HudEditorScreen(OdisseyConfig config, HudRenderer hud, Screen parent) {
		super(Component.literal("Editar HUD"));
		this.config = config;
		this.hud = hud;
		this.parent = parent;
	}

	@Override
	protected void init() {
		HudRenderer.Bounds info = this.hud.infoBounds(this.minecraft, this.width, this.height);
		HudRenderer.Bounds keys = this.hud.keysBounds(this.minecraft, this.width, this.height);
		if (info.width() > 0) {
			this.config.infoX = info.x();
			this.config.infoY = info.y();
		}
		if (this.config.keysX < 0 || this.config.keysY < 0) {
			this.config.keysX = keys.x();
			this.config.keysY = keys.y();
		}
	}

	@Override
	public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		graphics.fillGradient(0, 0, this.width, this.height, 0x99050507, 0xB308080B);
		graphics.fillGradient(0, 0, this.width, 74, 0x14F2C94C, 0x00000000);
	}

	@Override
	public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		this.hud.renderEditor(graphics, this.minecraft, mouseX, mouseY);

		int headerWidth = Math.min(252, Math.max(180, this.width - 228));
		int headerX = (this.width - headerWidth) / 2;
		UiDraw.panel(graphics, headerX, 6, headerWidth, 28, 8, 0xE80B0B0E, 0x44F2C94C);
		UiDraw.fillRounded(graphics, headerX + 10, 6, 38, 1, 0, GOLD);
		graphics.drawCenteredString(this.font, "EDITAR HUD", this.width / 2, 10, GOLD);
		graphics.drawCenteredString(this.font, "Arrastra INFO o TECLAS", this.width / 2, 21, MUTED);

		int footerWidth = Math.min(220, this.width - 20);
		int footerX = (this.width - footerWidth) / 2;
		int footerY = this.height - 28;
		UiDraw.panel(graphics, footerX, footerY, footerWidth, 20, 8, 0xD80B0B0E, 0x2EFFFFFF);
		UiDraw.fillRounded(graphics, footerX + 9, footerY + 8, 4, 4, 2, GOLD);
		String footer = "ESC / RSHIFT · GUARDAR Y VOLVER";
		graphics.drawString(this.font, footer, footerX + 18, footerY + 6, DIM, false);

		super.render(graphics, mouseX, mouseY, partialTick);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (event.button() != 0) {
			return super.mouseClicked(event, doubleClick);
		}

		if (this.config.showFps || this.config.showPing || this.config.showCoords || this.config.showClock || this.config.showCps) {
			HudRenderer.Bounds info = this.hud.infoBounds(this.minecraft, this.width, this.height);
			if (info.contains(event.x(), event.y())) {
				this.dragging = DragTarget.INFO;
				this.grabX = event.x() - info.x();
				this.grabY = event.y() - info.y();
				return true;
			}
		}
		if (this.config.showKeystrokes) {
			HudRenderer.Bounds keys = this.hud.keysBounds(this.minecraft, this.width, this.height);
			if (keys.contains(event.x(), event.y())) {
				this.dragging = DragTarget.KEYS;
				this.grabX = event.x() - keys.x();
				this.grabY = event.y() - keys.y();
				return true;
			}
		}
		return super.mouseClicked(event, doubleClick);
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dragX, double dragY) {
		if (this.dragging == DragTarget.INFO) {
			HudRenderer.Bounds info = this.hud.infoBounds(this.minecraft, this.width, this.height);
			this.config.infoX = clamp((int)Math.round(event.x() - this.grabX), 0, Math.max(0, this.width - info.width()));
			this.config.infoY = clamp((int)Math.round(event.y() - this.grabY), 0, Math.max(0, this.height - info.height()));
			return true;
		}
		if (this.dragging == DragTarget.KEYS) {
			HudRenderer.Bounds keys = this.hud.keysBounds(this.minecraft, this.width, this.height);
			this.config.keysX = clamp((int)Math.round(event.x() - this.grabX), 0, Math.max(0, this.width - keys.width()));
			this.config.keysY = clamp((int)Math.round(event.y() - this.grabY), 0, Math.max(0, this.height - keys.height()));
			return true;
		}
		return super.mouseDragged(event, dragX, dragY);
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		if (this.dragging != DragTarget.NONE) {
			this.dragging = DragTarget.NONE;
			this.config.save();
			return true;
		}
		return super.mouseReleased(event);
	}

	@Override
	public boolean keyPressed(KeyEvent event) {
		if (event.key() == GLFW.GLFW_KEY_RIGHT_SHIFT) {
			this.onClose();
			return true;
		}
		return super.keyPressed(event);
	}

	@Override
	public void onClose() {
		this.config.save();
		this.minecraft.setScreen(this.parent);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	private static int clamp(int value, int min, int max) {
		return Math.max(min, Math.min(max, value));
	}

	private enum DragTarget {
		NONE,
		INFO,
		KEYS
	}
}
