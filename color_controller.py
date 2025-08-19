"""Utility for selecting or setting the line color.

The original script always tried to open a Tkinter window to let the user pick
a colour.  In headless environments (like the testing container used for this
challenge) this raises ``TclError`` because a display is not available.  To
make the script usable everywhere, a ``--color`` CLI option is provided to set
the colour directly without showing the GUI.  If no option is given the
behaviour matches the previous implementation.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import tkinter as tk
from tkinter import colorchooser


CONFIG_PATH = Path(__file__).resolve().parent / "config" / "color.json"


def save_color(hex_color: str) -> None:
    """Persist selected ``hex_color`` to ``config/color.json``."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({"color": hex_color}, f)


def choose_color() -> None:
    """Open colour picker and save the chosen colour."""
    result = colorchooser.askcolor(color=current_color.get())
    if result[1]:
        current_color.set(result[1])
        color_display.config(bg=result[1])
        save_color(result[1])


def main() -> None:
    """Entry point for the colour controller."""
    parser = argparse.ArgumentParser(description="Select line colour")
    parser.add_argument(
        "--color",
        help="Hex colour value (e.g. #ff0000) to set without opening the GUI",
    )
    args = parser.parse_args()

    if args.color:
        save_color(args.color)
        return

    try:
        root = tk.Tk()
    except tk.TclError:
        # Running without a display: advise caller to use CLI option
        raise SystemExit("No display found. Use --color to set the colour.")

    root.title("Color Controller")

    global current_color, color_display
    current_color = tk.StringVar()

    # Load colour from config or use default
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            current_color.set(json.load(f).get("color", "#ff0000"))
    except FileNotFoundError:
        current_color.set("#ff0000")

    # Persist initial colour
    save_color(current_color.get())

    # Colour preview area
    color_display = tk.Label(root, width=20, height=5, bg=current_color.get())
    color_display.pack(padx=10, pady=10)

    # Button to open colour chooser
    choose_btn = tk.Button(root, text="Choose Color", command=choose_color)
    choose_btn.pack(padx=10, pady=10)

    root.mainloop()


# Globals populated when the GUI is launched.  They are defined here so the
# type checker knows about them and ``choose_color`` can access them.
current_color: tk.StringVar
color_display: tk.Label


if __name__ == "__main__":
    main()

