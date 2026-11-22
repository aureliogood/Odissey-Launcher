package com.odissey.client.ui;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.navigation.ScreenRectangle;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

public final class OdisseyText {
	private static final Identifier UI_FONT = Identifier.fromNamespaceAndPath("odissey", "ui");
	private static final Identifier SMALL_FONT = Identifier.fromNamespaceAndPath("odissey", "ui_small");
	private static final Identifier STRONG_FONT = Identifier.fromNamespaceAndPath("odissey", "ui_strong");
	private static final Identifier TITLE_FONT = Identifier.fromNamespaceAndPath("odissey", "ui_title");
	private static final Identifier DISPLAY_FONT = Identifier.fromNamespaceAndPath("odissey", "ui_display");
	private static final Identifier LOGO_FONT = Identifier.fromNamespaceAndPath("odissey", "ui_logo");
	private static final Identifier MENU_FONT = Identifier.fromNamespaceAndPath("odissey", "ui_menu");
	private static final Style UI = Style.EMPTY.withFont(new FontDescription.Resource(UI_FONT));
	private static final Style SMALL = Style.EMPTY.withFont(new FontDescription.Resource(SMALL_FONT));
	private static final Style STRONG = Style.EMPTY.withFont(new FontDescription.Resource(STRONG_FONT));
	private static final Style TITLE = Style.EMPTY.withFont(new FontDescription.Resource(TITLE_FONT));
	private static final Style DISPLAY = Style.EMPTY.withFont(new FontDescription.Resource(DISPLAY_FONT));
	private static final Style LOGO = Style.EMPTY.withFont(new FontDescription.Resource(LOGO_FONT));
	private static final Style MENU = Style.EMPTY.withFont(new FontDescription.Resource(MENU_FONT));

	private OdisseyText() {
	}

	public static Component ui(String text) {
		return Component.literal(text).withStyle(UI);
	}

	public static Component small(String text) {
		return Component.literal(text).withStyle(SMALL);
	}

	public static Component strong(String text) {
		return Component.literal(text).withStyle(STRONG);
	}

	public static Component title(String text) {
		return Component.literal(text).withStyle(TITLE);
	}

	public static Component display(String text) {
		return Component.literal(text).withStyle(DISPLAY);
	}

	public static Component logo(String text) {
		return Component.literal(text).withStyle(LOGO);
	}

	public static Component menu(String text) {
		return Component.literal(text).withStyle(MENU);
	}

	public static int width(Font font, String text) {
		return half(font.width(ui(text)));
	}

	public static int smallWidth(Font font, String text) {
		return half(font.width(small(text)));
	}

	public static int strongWidth(Font font, String text) {
		return half(font.width(strong(text)));
	}

	public static int titleWidth(Font font, String text) {
		return half(font.width(title(text)));
	}

	public static int displayWidth(Font font, String text) {
		return half(font.width(display(text)));
	}

	public static int logoWidth(Font font, String text) {
		return half(font.width(logo(text)));
	}

	public static int menuWidth(Font font, String text) {
		return half(font.width(menu(text)));
	}

	public static int logoWidth(Font font, String text, int spacing) {
		int width = 0;
		for (int index = 0; index < text.length(); index++) {
			width += half(font.width(logo(text.substring(index, index + 1)))) + spacing;
		}
		return Math.max(0, width - spacing);
	}

	public static ScreenRectangle menuBounds(Font font, String text) {
		return font.prepareText(menu(text).getVisualOrderText(), 0, 0, -1, false, false, 0).bounds();
	}

	public static void draw(GuiGraphics graphics, Font font, String text, int x, int y, int color) {
		drawHd(graphics, font, ui(text), x, y, color);
	}

	public static void drawSmall(GuiGraphics graphics, Font font, String text, int x, int y, int color) {
		drawHd(graphics, font, small(text), x, y, color);
	}

	public static void drawStrong(GuiGraphics graphics, Font font, String text, int x, int y, int color) {
		drawHd(graphics, font, strong(text), x, y, color);
	}

	public static void drawTitle(GuiGraphics graphics, Font font, String text, int x, int y, int color) {
		drawHd(graphics, font, title(text), x, y, color);
	}

	public static void drawDisplay(GuiGraphics graphics, Font font, String text, int x, int y, int color) {
		drawHd(graphics, font, display(text), x, y, color);
	}

	public static void drawLogo(GuiGraphics graphics, Font font, String text, int x, int y, int color) {
		drawHd(graphics, font, logo(text), x, y, color);
	}

	public static void drawMenu(GuiGraphics graphics, Font font, String text, int x, int y, int color) {
		drawHd(graphics, font, menu(text), x, y, color);
	}

	private static void drawHd(
		GuiGraphics graphics,
		Font font,
		Component text,
		int x,
		int y,
		int color
	) {
		graphics.pose().pushMatrix();
		graphics.pose().scale(0.5F, 0.5F);
		graphics.drawString(font, text, x * 2, y * 2, color, false);
		graphics.pose().popMatrix();
	}

	private static int half(int value) {
		return Math.round(value / 2.0F);
	}

	public static void center(GuiGraphics graphics, Font font, String text, int centerX, int y, int color) {
		draw(graphics, font, text, centerX - width(font, text) / 2, y, color);
	}

	public static void right(GuiGraphics graphics, Font font, String text, int rightX, int y, int color) {
		drawSmall(graphics, font, text, rightX - smallWidth(font, text), y, color);
	}

	public static void tracked(GuiGraphics graphics, Font font, String text, int x, int y, int color, int spacing) {
		int cursor = x;
		for (int index = 0; index < text.length(); index++) {
			String glyph = text.substring(index, index + 1);
			drawSmall(graphics, font, glyph, cursor, y, color);
			cursor += smallWidth(font, glyph) + spacing;
		}
	}

	public static int trackedWidth(Font font, String text, int spacing) {
		int width = 0;
		for (int index = 0; index < text.length(); index++) {
			width += smallWidth(font, text.substring(index, index + 1)) + spacing;
		}
		return Math.max(0, width - spacing);
	}

	public static int alpha(int color, float opacity) {
		int baseAlpha = color >>> 24;
		int alpha = Mth.clamp(Math.round(baseAlpha * Mth.clamp(opacity, 0.0F, 1.0F)), 0, 255);
		return color & 0xFFFFFF | alpha << 24;
	}
}

