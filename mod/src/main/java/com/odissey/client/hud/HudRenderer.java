package com.odissey.client.hud;

import com.odissey.client.config.OdisseyConfig;
import com.odissey.client.ui.UiDraw;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.util.Mth;

public final class HudRenderer implements HudElement {
	private static final int GOLD = 0xFFF2C94C;
	private static final int GOLD_SOFT = 0xFFE8C766;
	private static final int WHITE = 0xFFF4F4F5;
	private static final int MUTED = 0xFFA0A0A8;
	private static final int RED = 0xFFFF6B6B;
	private static final int GREEN = 0xFF6EE7A0;
	private static final int PANEL_BG = 0xD40A0A0D;
	private static final int PANEL_BORDER = 0x44F2C94C;
	private static final int PANEL_LINE = 0x22FFFFFF;

	private static final int INFO_PAD_X = 9;
	private static final int INFO_PAD_Y = 8;
	private static final int INFO_ROW = 11;

	private static final int KEY_W = 24;
	private static final int KEY_H = 18;
	private static final int KEY_GAP = 3;
	private static final int KEYS_PAD = 6;
	private static final int KEYS_W = KEYS_PAD * 2 + KEY_W * 3 + KEY_GAP * 2;
	private static final int KEYS_H = KEYS_PAD * 2 + KEY_H * 3 + KEY_GAP * 2;

	private final OdisseyConfig config;
	private final ClickTracker clicks = new ClickTracker();

	public HudRenderer(OdisseyConfig config) {
		this.config = config;
	}

	@Override
	public void render(GuiGraphics graphics, DeltaTracker deltaTracker) {
		Minecraft minecraft = Minecraft.getInstance();
		if (minecraft.player == null || minecraft.options.hideGui) {
			return;
		}
		if (minecraft.screen == null) {
			this.clicks.update(minecraft);
		}
		this.draw(graphics, minecraft, false, 0, 0);
	}

	public void renderEditor(GuiGraphics graphics, Minecraft minecraft, int mouseX, int mouseY) {
		this.draw(graphics, minecraft, true, mouseX, mouseY);
	}

	public Bounds infoBounds(Minecraft minecraft, int guiWidth, int guiHeight) {
		Font font = minecraft.font;
		List<InfoLine> lines = this.infoLines(minecraft);
		if (lines.isEmpty()) {
			return new Bounds(0, 0, 0, 0);
		}
		int width = this.infoWidth(font, lines);
		int height = INFO_PAD_Y * 2 + lines.size() * INFO_ROW - 2;
		int x = clamp(this.config.infoX, 0, Math.max(0, guiWidth - width));
		int y = clamp(this.config.infoY, 0, Math.max(0, guiHeight - height));
		return new Bounds(x, y, width, height);
	}

	public Bounds keysBounds(Minecraft minecraft, int guiWidth, int guiHeight) {
		int x = this.config.keysX < 0 ? guiWidth - KEYS_W - 8 : this.config.keysX;
		int y = this.config.keysY < 0 ? guiHeight - KEYS_H - 8 : this.config.keysY;
		x = clamp(x, 0, Math.max(0, guiWidth - KEYS_W));
		y = clamp(y, 0, Math.max(0, guiHeight - KEYS_H));
		return new Bounds(x, y, KEYS_W, KEYS_H);
	}

	private void draw(GuiGraphics graphics, Minecraft minecraft, boolean editor, int mouseX, int mouseY) {
		Font font = minecraft.font;
		if (this.config.showFps
			|| this.config.showPing
			|| this.config.showCoords
			|| this.config.showClock
			|| this.config.showCps) {
			this.drawInfo(graphics, font, minecraft, editor, mouseX, mouseY);
		}
		if (this.config.showKeystrokes) {
			this.drawKeys(graphics, font, minecraft, editor, mouseX, mouseY);
		}
	}

	private void drawInfo(GuiGraphics graphics, Font font, Minecraft minecraft, boolean editor, int mouseX, int mouseY) {
		List<InfoLine> lines = this.infoLines(minecraft);
		if (lines.isEmpty()) {
			return;
		}
		Bounds bounds = this.infoBounds(minecraft, graphics.guiWidth(), graphics.guiHeight());
		drawPanel(graphics, bounds);

		int labelWidth = 0;
		for (InfoLine line : lines) {
			labelWidth = Math.max(labelWidth, font.width(line.label()));
		}

		int x = bounds.x() + INFO_PAD_X;
		int y = bounds.y() + INFO_PAD_Y;
		for (InfoLine line : lines) {
			graphics.drawString(font, line.label(), x, y, GOLD_SOFT, true);
			graphics.drawString(font, line.value(), x + labelWidth + 7, y, line.color(), true);
			y += INFO_ROW;
		}

		if (editor) {
			drawEditorOutline(graphics, bounds, mouseX, mouseY);
			drawEditorLabel(graphics, font, "INFO", bounds);
		}
	}

	private void drawKeys(GuiGraphics graphics, Font font, Minecraft minecraft, boolean editor, int mouseX, int mouseY) {
		Bounds bounds = this.keysBounds(minecraft, graphics.guiWidth(), graphics.guiHeight());
		drawPanel(graphics, bounds);

		int left = bounds.x() + KEYS_PAD;
		int top = bounds.y() + KEYS_PAD;
		boolean forward = minecraft.options.keyUp.isDown();
		boolean back = minecraft.options.keyDown.isDown();
		boolean leftKey = minecraft.options.keyLeft.isDown();
		boolean rightKey = minecraft.options.keyRight.isDown();
		boolean attack = minecraft.mouseHandler.isLeftPressed();
		boolean use = minecraft.mouseHandler.isRightPressed();

		int centerX = left + KEY_W + KEY_GAP;
		drawKey(graphics, font, "W", centerX, top, KEY_W, forward);
		drawKey(graphics, font, "A", left, top + KEY_H + KEY_GAP, KEY_W, leftKey);
		drawKey(graphics, font, "S", centerX, top + KEY_H + KEY_GAP, KEY_W, back);
		drawKey(graphics, font, "D", left + (KEY_W + KEY_GAP) * 2, top + KEY_H + KEY_GAP, KEY_W, rightKey);

		int mouseTop = top + (KEY_H + KEY_GAP) * 2;
		int mouseWidth = (KEYS_W - KEYS_PAD * 2 - KEY_GAP) / 2;
		drawKey(graphics, font, "LMB", left, mouseTop, mouseWidth, attack);
		drawKey(graphics, font, "RMB", left + mouseWidth + KEY_GAP, mouseTop, mouseWidth, use);

		if (editor) {
			drawEditorOutline(graphics, bounds, mouseX, mouseY);
			drawEditorLabel(graphics, font, "TECLAS", bounds);
		}
	}

	private List<InfoLine> infoLines(Minecraft minecraft) {
		List<InfoLine> lines = new ArrayList<>(5);
		if (this.config.showFps) {
			int fps = minecraft.getFps();
			int color = fps >= 120 ? GREEN : fps >= 60 ? WHITE : RED;
			lines.add(new InfoLine("FPS", Integer.toString(fps), color));
		}
		if (this.config.showPing) {
			int ping = this.ping(minecraft);
			String value = ping < 0 ? "--" : ping + " ms";
			int color = ping < 0 ? MUTED : ping <= 60 ? GREEN : ping <= 120 ? GOLD_SOFT : RED;
			lines.add(new InfoLine("PING", value, color));
		}
		if (this.config.showCoords) {
			LocalPlayer player = minecraft.player;
			String value = player == null
				? "-- -- --"
				: Mth.floor(player.getX()) + " " + Mth.floor(player.getY()) + " " + Mth.floor(player.getZ());
			lines.add(new InfoLine("XYZ", value, WHITE));
		}
		if (this.config.showClock) {
			LocalTime now = LocalTime.now();
			lines.add(new InfoLine("HORA", String.format("%02d:%02d", now.getHour(), now.getMinute()), WHITE));
		}
		if (this.config.showCps) {
			lines.add(new InfoLine("CPS", this.clicks.leftCps() + " / " + this.clicks.rightCps(), WHITE));
		}
		return lines;
	}

	private int infoWidth(Font font, List<InfoLine> lines) {
		int labelWidth = 0;
		int valueWidth = 0;
		for (InfoLine line : lines) {
			labelWidth = Math.max(labelWidth, font.width(line.label()));
			valueWidth = Math.max(valueWidth, font.width(line.value()));
		}
		return INFO_PAD_X * 2 + labelWidth + 7 + valueWidth;
	}

	private int ping(Minecraft minecraft) {
		ClientPacketListener connection = minecraft.getConnection();
		LocalPlayer player = minecraft.player;
		if (connection == null || player == null) {
			return -1;
		}
		PlayerInfo info = connection.getPlayerInfo(player.getUUID());
		return info == null ? -1 : info.getLatency();
	}

	private static void drawPanel(GuiGraphics graphics, Bounds bounds) {
		int x = bounds.x();
		int y = bounds.y();
		int width = bounds.width();
		int height = bounds.height();
		UiDraw.panel(graphics, x, y, width, height, 7, PANEL_BG, PANEL_BORDER);
		UiDraw.fillRounded(graphics, x + 1, y + 7, 2, height - 14, 1, GOLD);
		UiDraw.fillRounded(graphics, x + 7, y, width - 14, 1, 0, PANEL_LINE);
	}

	private static void drawKey(GuiGraphics graphics, Font font, String label, int x, int y, int width, boolean pressed) {
		UiDraw.keycap(graphics, x, y, width, KEY_H, pressed);
		int textColor = pressed ? 0xFF17130A : 0xFFD6D6DA;
		graphics.drawCenteredString(font, label, x + width / 2, y + 5, textColor);
	}

	private static void drawEditorOutline(GuiGraphics graphics, Bounds bounds, int mouseX, int mouseY) {
		boolean hover = bounds.contains(mouseX, mouseY);
		int color = hover ? 0xFFFFFFFF : 0xCCF2C94C;
		UiDraw.outline(graphics, bounds.x() - 3, bounds.y() - 3, bounds.width() + 6, bounds.height() + 6, color);
		int dotY = bounds.y() >= 10 ? bounds.y() - 8 : bounds.y() + 3;
		for (int dot = 0; dot < 3; dot++) {
			UiDraw.fillRounded(graphics, bounds.x() + bounds.width() - 12 + dot * 4, dotY, 2, 2, 1, color);
		}
	}

	private static void drawEditorLabel(GuiGraphics graphics, Font font, String text, Bounds bounds) {
		int width = font.width(text) + 12;
		int labelY = bounds.y() - 15;
		if (labelY < 2) {
			labelY = bounds.y() + bounds.height() + 3;
		}
		if (labelY + 12 > graphics.guiHeight()) {
			labelY = Math.max(2, bounds.y() + 3);
		}
		UiDraw.fillRounded(graphics, bounds.x() - 2, labelY, width, 12, 5, 0xDD17130A);
		graphics.drawString(font, text, bounds.x() + 4, labelY + 4, GOLD, false);
	}

	private static int clamp(int value, int min, int max) {
		return Math.max(min, Math.min(max, value));
	}

	private record InfoLine(String label, String value, int color) {
	}

	public record Bounds(int x, int y, int width, int height) {
		public boolean contains(double px, double py) {
			return px >= this.x && px < this.x + this.width && py >= this.y && py < this.y + this.height;
		}
	}
}
