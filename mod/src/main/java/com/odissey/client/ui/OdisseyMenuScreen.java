package com.odissey.client.ui;

import com.odissey.client.config.OdisseyConfig;
import com.odissey.client.hud.HudRenderer;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;

public final class OdisseyMenuScreen extends Screen {
	private static final int GOLD = 0xFFF2C94C;
	private static final int GOLD_BRIGHT = 0xFFFFD966;
	private static final int INK = 0xFF17130A;
	private static final int WHITE = 0xFFF4F4F5;
	private static final int MUTED = 0xFFA0A0A8;
	private static final int DIM = 0xFF6B6B73;
	private static final int GREEN = 0xFF6EE7A0;
	private static final int PANEL = 0xF00A0A0D;
	private static final int CARD = 0xE00F0F13;
	private static final int CARD_ACTIVE = 0xE6141418;

	private static final int PANEL_MAX_W = 412;
	private static final int PANEL_MAX_H = 224;
	private static final int PAD = 12;
	private static final int HEADER_H = 38;
	private static final int CARD_H = 56;
	private static final int CARD_GAP = 7;
	private static final int GRID_GAP = 6;
	private static final int FOOTER_H = 20;
	private static final int EDIT_W = 92;
	private static final int RESET_W = 86;
	private static final int STATUS_W = 100;

	private final OdisseyConfig config;
	private final HudRenderer hud;
	private final List<Module> modules;
	private final long openedAt = System.currentTimeMillis();
	private Filter filter = Filter.ALL;

	public OdisseyMenuScreen(OdisseyConfig config, HudRenderer hud) {
		super(Component.literal("Odissey Client"));
		this.config = config;
		this.hud = hud;
		this.modules = List.of(
			new Module("FPS", Group.INFO, Icon.FPS, () -> this.config.showFps, () -> this.config.showFps = !this.config.showFps),
			new Module("Ping", Group.INFO, Icon.PING, () -> this.config.showPing, () -> this.config.showPing = !this.config.showPing),
			new Module("Coordenadas", Group.INFO, Icon.PIN, () -> this.config.showCoords, () -> this.config.showCoords = !this.config.showCoords),
			new Module("Reloj", Group.INFO, Icon.CLOCK, () -> this.config.showClock, () -> this.config.showClock = !this.config.showClock),
			new Module("CPS", Group.INTERFACE, Icon.MOUSE, () -> this.config.showCps, () -> this.config.showCps = !this.config.showCps),
			new Module("Teclas", Group.INTERFACE, Icon.KEYS, () -> this.config.showKeystrokes, () -> this.config.showKeystrokes = !this.config.showKeystrokes)
		);
	}

	@Override
	public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		graphics.fillGradient(0, 0, this.width, this.height, 0xA8050507, 0xD008080B);
		graphics.fillGradient(0, 0, this.width, Math.max(110, this.height / 2), 0x18F2C94C, 0x00000000);
	}

	@Override
	public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		Layout layout = this.layout();
		UiDraw.panel(graphics, layout.px(), layout.py(), layout.pw(), layout.ph(), 10, PANEL, 0x55F2C94C);
		UiDraw.fillRounded(graphics, layout.px() + 22, layout.py(), 54, 1, 0, GOLD);
		UiDraw.fillRounded(graphics, layout.px() + 5, layout.py() + 18, 2, layout.ph() - 36, 1, 0xCCF2C94C);
		graphics.fillGradient(
			layout.px() + 12,
			layout.py() + HEADER_H,
			layout.px() + layout.pw() - 12,
			layout.py() + HEADER_H + 1,
			0x44F2C94C,
			0x08FFFFFF
		);

		this.drawHeader(graphics, layout, mouseX, mouseY);
		this.drawToolbar(graphics, layout, mouseX, mouseY);

		List<Module> visible = this.visibleModules();
		for (int i = 0; i < visible.size(); i++) {
			int x = this.cardX(layout, i);
			int y = this.cardY(layout, i);
			this.drawModule(graphics, visible.get(i), x, y, layout.cardW(), CARD_H, inside(mouseX, mouseY, x, y, layout.cardW(), CARD_H));
		}

		this.drawFooter(graphics, layout, mouseX, mouseY);

		super.render(graphics, mouseX, mouseY, partialTick);
	}

	private void drawHeader(GuiGraphics graphics, Layout layout, int mouseX, int mouseY) {
		int x = layout.px() + PAD;
		int y = layout.py() + 8;

		UiDraw.fillRounded(graphics, x, y, 22, 22, 7, 0x44F2C94C);
		UiDraw.fillRounded(graphics, x + 1, y + 1, 20, 20, 6, GOLD);
		graphics.drawCenteredString(this.font, "O", x + 11, y + 7, INK);

		int textX = x + 31;
		graphics.drawString(this.font, "ODISSEY", textX, y + 1, GOLD, true);
		graphics.drawString(this.font, "CLIENT", textX + this.font.width("ODISSEY") + 5, y + 1, WHITE, true);
		graphics.drawString(this.font, "OVERLAY SYSTEM", textX, y + 13, MUTED, false);

		int hudW = this.font.width("HUD") + 20;
		int layoutW = this.font.width("LAYOUT") + 20;
		int tabsX = layout.px() + (layout.pw() - hudW - layoutW - 4) / 2;
		int tabsY = layout.py() + 8;
		this.drawTab(graphics, "HUD", tabsX, tabsY, hudW, 20, true, inside(mouseX, mouseY, tabsX, tabsY, hudW, 20));
		this.drawTab(graphics, "LAYOUT", tabsX + hudW + 4, tabsY, layoutW, 20, false, inside(mouseX, mouseY, tabsX + hudW + 4, tabsY, layoutW, 20));

		int closeSize = 18;
		int closeX = layout.px() + layout.pw() - PAD - closeSize;
		int closeY = layout.py() + 9;
		boolean closeHover = inside(mouseX, mouseY, closeX, closeY, closeSize, closeSize);
		UiDraw.panel(graphics, closeX, closeY, closeSize, closeSize, 5, closeHover ? 0x35F2C94C : 0x22101014, closeHover ? GOLD : 0x33FFFFFF);
		graphics.drawCenteredString(this.font, "X", closeX + closeSize / 2, closeY + 5, closeHover ? GOLD : MUTED);
	}

	private void drawTab(GuiGraphics graphics, String label, int x, int y, int width, int height, boolean active, boolean hovered) {
		int background = active ? 0x2CF2C94C : hovered ? 0x18FFFFFF : 0x0FFFFFFF;
		int border = active ? 0x66F2C94C : hovered ? 0x44FFFFFF : 0x22FFFFFF;
		UiDraw.panel(graphics, x, y, width, height, 5, background, border);
		graphics.drawCenteredString(this.font, label, x + width / 2, y + 6, active ? GOLD : hovered ? WHITE : MUTED);
		if (active) {
			UiDraw.fillRounded(graphics, x + 9, y + height - 2, width - 18, 1, 0, GOLD);
		}
	}

	private void drawToolbar(GuiGraphics graphics, Layout layout, int mouseX, int mouseY) {
		List<Chip> chips = this.filterChips(layout);
		for (Chip chip : chips) {
			boolean active = this.filter == chip.filter();
			boolean hovered = inside(mouseX, mouseY, chip.x(), chip.y(), chip.width(), chip.height());
			int background = active ? 0x2EF2C94C : hovered ? 0x1FFFFFFF : 0x12FFFFFF;
			int border = active ? 0x66F2C94C : hovered ? 0x33FFFFFF : 0x1AFFFFFF;
			UiDraw.panel(graphics, chip.x(), chip.y(), chip.width(), chip.height(), 4, background, border);
			graphics.drawCenteredString(this.font, chip.filter().label(), chip.x() + chip.width() / 2, chip.y() + 4, active ? GOLD : hovered ? WHITE : MUTED);
		}

		String count = this.visibleModules().size() + " MODULOS";
		graphics.drawString(
			this.font,
			count,
			layout.px() + layout.pw() - PAD - this.font.width(count),
			layout.py() + 47,
			DIM,
			false
		);
	}

	private void drawModule(GuiGraphics graphics, Module module, int x, int y, int width, int height, boolean hovered) {
		boolean enabled = module.enabled().getAsBoolean();
		int background = hovered ? 0xE61A1A20 : enabled ? CARD_ACTIVE : CARD;
		int border = hovered ? GOLD : enabled ? 0x55F2C94C : 0x22FFFFFF;
		UiDraw.panel(graphics, x, y, width, height, 7, background, border);
		UiDraw.fillRounded(graphics, x + 9, y, width - 18, 1, 0, enabled ? 0x88F2C94C : hovered ? 0x44FFFFFF : 0x18FFFFFF);

		int iconBoxX = x + width / 2 - 9;
		int iconBoxY = y + 7;
		int iconBg = enabled ? 0x26F2C94C : 0x16FFFFFF;
		UiDraw.fillRounded(graphics, iconBoxX, iconBoxY, 18, 18, 6, iconBg);
		drawIcon(graphics, module.icon(), iconBoxX + 1, iconBoxY + 1, enabled ? GOLD : MUTED, iconBg);

		int labelY = y + 28;
		graphics.drawCenteredString(this.font, module.label(), x + width / 2, labelY, enabled ? WHITE : MUTED);

		int footW = width - 12;
		int footX = x + 6;
		int footY = y + 40;
		UiDraw.fillRounded(graphics, footX, footY, footW, 12, 4, enabled ? 0x33F2C94C : 0x14FFFFFF);
		graphics.drawCenteredString(this.font, enabled ? "ACTIVADO" : "DESACTIVADO", footX + footW / 2, footY + 2, enabled ? GOLD : DIM);
	}

	private void drawFooter(GuiGraphics graphics, Layout layout, int mouseX, int mouseY) {
		int y = layout.buttonY();
		int h = layout.buttonH();
		int editX = layout.px() + PAD;
		this.drawButton(graphics, "EDITAR HUD", editX, y, EDIT_W, h, inside(mouseX, mouseY, editX, y, EDIT_W, h), true);

		int resetX = editX + EDIT_W + 6;
		this.drawButton(graphics, "RESTABLECER", resetX, y, RESET_W, h, inside(mouseX, mouseY, resetX, y, RESET_W, h), false);

		int statusX = layout.px() + layout.pw() - PAD - STATUS_W;
		UiDraw.panel(graphics, statusX, y, STATUS_W, h, 5, 0x1A6EE7A0, 0x446EE7A0);
		UiDraw.fillRounded(graphics, statusX + 10, y + h / 2 - 2, 4, 4, 2, GREEN);
		graphics.drawString(this.font, "OVERLAY ACTIVO", statusX + 18, y + (h - 8) / 2, GREEN, false);

		String saved = "AUTOGUARDADO";
		int savedX = resetX + RESET_W + (statusX - resetX - RESET_W - this.font.width(saved)) / 2;
		graphics.drawString(this.font, saved, savedX, y + (h - 8) / 2, DIM, false);
	}

	private void drawButton(GuiGraphics graphics, String label, int x, int y, int width, int height, boolean hovered, boolean primary) {
		if (primary) {
			UiDraw.fillRounded(graphics, x, y + 2, width, height, 6, 0x66000000);
			UiDraw.fillRounded(graphics, x, y, width, height, 6, hovered ? GOLD_BRIGHT : GOLD);
			UiDraw.fillRounded(graphics, x + 1, y + 1, width - 2, 1, 0, 0x55FFFFFF);
			graphics.drawCenteredString(this.font, label, x + width / 2, y + (height - 8) / 2, INK);
			return;
		}

		UiDraw.panel(graphics, x, y, width, height, 5, hovered ? 0x35F2C94C : 0x33101013, hovered ? GOLD : 0x33FFFFFF);
		graphics.drawCenteredString(this.font, label, x + width / 2, y + (height - 8) / 2, hovered ? GOLD : MUTED);
	}

	private static void drawIcon(GuiGraphics graphics, Icon icon, int x, int y, int color, int background) {
		switch (icon) {
			case FPS -> {
				UiDraw.fillRounded(graphics, x + 2, y + 10, 3, 5, 1, color);
				UiDraw.fillRounded(graphics, x + 7, y + 6, 3, 9, 1, color);
				UiDraw.fillRounded(graphics, x + 12, y + 2, 3, 13, 1, color);
			}
			case PING -> {
				drawRing(graphics, x + 8, y + 8, 6, color);
				graphics.fill(x + 2, y + 7, x + 14, y + 8, color);
				graphics.fill(x + 8, y + 2, x + 9, y + 14, color);
			}
			case PIN -> {
				UiDraw.fillRounded(graphics, x + 4, y + 1, 9, 9, 5, color);
				UiDraw.fillRounded(graphics, x + 6, y + 8, 5, 5, 2, color);
				UiDraw.fillRounded(graphics, x + 7, y + 3, 3, 3, 2, background);
			}
			case CLOCK -> {
				drawRing(graphics, x + 8, y + 8, 6, color);
				graphics.fill(x + 7, y + 3, x + 8, y + 8, color);
				graphics.fill(x + 8, y + 7, x + 12, y + 8, color);
			}
			case MOUSE -> {
				UiDraw.fillRounded(graphics, x + 4, y + 1, 9, 14, 4, color);
				UiDraw.fillRounded(graphics, x + 5, y + 2, 7, 12, 3, background);
				graphics.fill(x + 8, y + 3, x + 9, y + 7, color);
			}
			case KEYS -> {
				UiDraw.fillRounded(graphics, x + 1, y + 4, 14, 9, 2, color);
				UiDraw.fillRounded(graphics, x + 2, y + 5, 12, 7, 1, background);
				for (int row = 0; row < 2; row++) {
					for (int column = 0; column < 4; column++) {
						graphics.fill(x + 4 + column * 3, y + 7 + row * 2, x + 5 + column * 3, y + 8 + row * 2, color);
					}
				}
			}
		}
	}

	private static void drawRing(GuiGraphics graphics, int centerX, int centerY, int radius, int color) {
		for (int offset = -radius; offset <= radius; offset++) {
			int outer = (int)Math.sqrt(radius * radius - offset * offset);
			int innerRadius = radius - 1;
			int inner = (int)Math.sqrt(Math.max(0, innerRadius * innerRadius - offset * offset));
			graphics.fill(centerX - outer, centerY + offset, centerX - inner, centerY + offset + 1, color);
			graphics.fill(centerX + inner, centerY + offset, centerX + outer, centerY + offset + 1, color);
		}
	}

	private List<Module> visibleModules() {
		List<Module> visible = new ArrayList<>();
		for (Module module : this.modules) {
			boolean include = switch (this.filter) {
				case ALL -> true;
				case INFO -> module.group() == Group.INFO;
				case INTERFACE -> module.group() == Group.INTERFACE;
				case ACTIVE -> module.enabled().getAsBoolean();
			};
			if (include) {
				visible.add(module);
			}
		}
		return visible;
	}

	private List<Chip> filterChips(Layout layout) {
		List<Chip> chips = new ArrayList<>();
		int x = layout.px() + PAD;
		int y = layout.py() + 42;
		for (Filter value : Filter.values()) {
			int width = this.font.width(value.label()) + 12;
			chips.add(new Chip(value, x, y, width, 16));
			x += width + 5;
		}
		return chips;
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (event.button() == 0) {
			Layout layout = this.layout();
			int closeSize = 18;
			int closeX = layout.px() + layout.pw() - PAD - closeSize;
			int closeY = layout.py() + 9;
			if (inside(event.x(), event.y(), closeX, closeY, closeSize, closeSize)) {
				this.onClose();
				return true;
			}

			int hudW = this.font.width("HUD") + 20;
			int layoutW = this.font.width("LAYOUT") + 20;
			int tabsX = layout.px() + (layout.pw() - hudW - layoutW - 4) / 2;
			int tabsY = layout.py() + 8;
			if (inside(event.x(), event.y(), tabsX + hudW + 4, tabsY, layoutW, 20)) {
				this.minecraft.setScreen(new HudEditorScreen(this.config, this.hud, this));
				return true;
			}

			for (Chip chip : this.filterChips(layout)) {
				if (inside(event.x(), event.y(), chip.x(), chip.y(), chip.width(), chip.height())) {
					this.filter = chip.filter();
					return true;
				}
			}

			List<Module> visible = this.visibleModules();
			for (int i = 0; i < visible.size(); i++) {
				int x = this.cardX(layout, i);
				int y = this.cardY(layout, i);
				if (inside(event.x(), event.y(), x, y, layout.cardW(), CARD_H)) {
					visible.get(i).toggle().run();
					this.config.save();
					return true;
				}
			}

			int y = layout.buttonY();
			int h = layout.buttonH();
			int editX = layout.px() + PAD;
			if (inside(event.x(), event.y(), editX, y, EDIT_W, h)) {
				this.minecraft.setScreen(new HudEditorScreen(this.config, this.hud, this));
				return true;
			}

			int resetX = editX + EDIT_W + 6;
			if (inside(event.x(), event.y(), resetX, y, RESET_W, h)) {
				this.config.resetAll();
				this.config.save();
				return true;
			}
		}
		return super.mouseClicked(event, doubleClick);
	}

	@Override
	public boolean keyPressed(KeyEvent event) {
		if (event.key() == GLFW.GLFW_KEY_RIGHT_SHIFT) {
			if (System.currentTimeMillis() - this.openedAt > 250) {
				this.onClose();
			}
			return true;
		}
		return super.keyPressed(event);
	}

	@Override
	public void onClose() {
		this.config.save();
		this.minecraft.setScreen(null);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	private Layout layout() {
		int pw = Math.min(PANEL_MAX_W, this.width - 18);
		int ph = Math.min(PANEL_MAX_H, this.height - 14);
		int px = (this.width - pw) / 2;
		int py = (this.height - ph) / 2;
		int cardW = (pw - PAD * 2 - GRID_GAP * 2) / 3;
		int cardTop = py + 66;
		int buttonY = py + ph - 30;
		return new Layout(px, py, pw, ph, cardW, cardTop, buttonY, FOOTER_H);
	}

	private int cardX(Layout layout, int index) {
		return layout.px() + PAD + (index % 3) * (layout.cardW() + GRID_GAP);
	}

	private int cardY(Layout layout, int index) {
		return layout.cardTop() + (index / 3) * (CARD_H + CARD_GAP);
	}

	private static boolean inside(double mouseX, double mouseY, int x, int y, int width, int height) {
		return mouseX >= x && mouseX < x + width && mouseY >= y && mouseY < y + height;
	}

	private enum Group {
		INFO,
		INTERFACE
	}

	private enum Icon {
		FPS,
		PING,
		PIN,
		CLOCK,
		MOUSE,
		KEYS
	}

	private enum Filter {
		ALL("TODOS"),
		INFO("INFO"),
		INTERFACE("INTERFAZ"),
		ACTIVE("ACTIVOS");

		private final String label;

		Filter(String label) {
			this.label = label;
		}

		public String label() {
			return this.label;
		}
	}

	private record Module(String label, Group group, Icon icon, BooleanSupplier enabled, Runnable toggle) {
	}

	private record Chip(Filter filter, int x, int y, int width, int height) {
	}

	private record Layout(int px, int py, int pw, int ph, int cardW, int cardTop, int buttonY, int buttonH) {
	}
}
