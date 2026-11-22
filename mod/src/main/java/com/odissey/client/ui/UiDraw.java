package com.odissey.client.ui;

import net.minecraft.client.gui.GuiGraphics;

public final class UiDraw {
	private UiDraw() {
	}

	public static void fillRounded(GuiGraphics graphics, int x, int y, int width, int height, int radius, int color) {
		if (width <= 0 || height <= 0) {
			return;
		}
		graphics.pose().pushMatrix();
		graphics.pose().scale(0.5F, 0.5F);
		fillRoundedHd(graphics, x * 2, y * 2, width * 2, height * 2, radius * 2, color);
		graphics.pose().popMatrix();
	}

	private static void fillRoundedHd(GuiGraphics graphics, int x, int y, int width, int height, int radius, int color) {
		int r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
		if (r == 0) {
			graphics.fill(x, y, x + width, y + height, color);
			return;
		}
		for (int row = 0; row < height; row++) {
			int inset = 0;
			if (row < r) {
				inset = inset(row, r);
			} else if (row >= height - r) {
				inset = inset(height - 1 - row, r);
			}
			graphics.fill(x + inset, y + row, x + width - inset, y + row + 1, color);
		}
	}

	public static void panel(GuiGraphics graphics, int x, int y, int width, int height, int radius, int background, int border) {
		fillRounded(graphics, x, y + 2, width, height, radius, 0x55000000);
		fillRounded(graphics, x, y, width, height, radius, border);
		fillRounded(graphics, x + 1, y + 1, width - 2, height - 2, Math.max(0, radius - 1), background);
	}

	public static void outline(GuiGraphics graphics, int x, int y, int width, int height, int color) {
		fillRounded(graphics, x, y, width, 1, 0, color);
		fillRounded(graphics, x, y + height - 1, width, 1, 0, color);
		fillRounded(graphics, x, y, 1, height, 0, color);
		fillRounded(graphics, x + width - 1, y, 1, height, 0, color);
	}

	public static void keycap(GuiGraphics graphics, int x, int y, int width, int height, boolean active) {
		fillRounded(graphics, x, y + 1, width, height, 5, 0x66000000);
		fillRounded(graphics, x, y, width, height, 5, active ? 0xEEF2C94C : 0x55FFFFFF);
		fillRounded(graphics, x + 1, y + 1, width - 2, height - 2, 4, active ? 0xFFF2C94C : 0x99101014);
		if (!active) {
			fillRounded(graphics, x + 2, y + 1, width - 4, 1, 0, 0x1FFFFFFF);
		}
	}

	private static int inset(int row, int radius) {
		double dy = radius - row - 0.5;
		double value = radius * radius - dy * dy;
		return (int)Math.round(radius - Math.sqrt(Math.max(0, value)));
	}
}
