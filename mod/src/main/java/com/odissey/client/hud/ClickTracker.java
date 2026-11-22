package com.odissey.client.hud;

import java.util.ArrayDeque;
import java.util.Deque;
import net.minecraft.client.Minecraft;

public final class ClickTracker {
	private final Deque<Long> leftClicks = new ArrayDeque<>();
	private final Deque<Long> rightClicks = new ArrayDeque<>();
	private boolean leftDown;
	private boolean rightDown;

	public void update(Minecraft minecraft) {
		long now = System.currentTimeMillis();
		boolean left = minecraft.mouseHandler.isLeftPressed();
		boolean right = minecraft.mouseHandler.isRightPressed();

		if (left && !this.leftDown) {
			this.leftClicks.addLast(now);
		}
		if (right && !this.rightDown) {
			this.rightClicks.addLast(now);
		}

		this.leftDown = left;
		this.rightDown = right;
		this.prune(now);
	}

	public int leftCps() {
		this.prune(System.currentTimeMillis());
		return this.leftClicks.size();
	}

	public int rightCps() {
		this.prune(System.currentTimeMillis());
		return this.rightClicks.size();
	}

	private void prune(long now) {
		long cutoff = now - 1000L;
		while (!this.leftClicks.isEmpty() && this.leftClicks.peekFirst() < cutoff) {
			this.leftClicks.removeFirst();
		}
		while (!this.rightClicks.isEmpty() && this.rightClicks.peekFirst() < cutoff) {
			this.rightClicks.removeFirst();
		}
	}
}
