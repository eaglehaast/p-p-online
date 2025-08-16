import json
from pathlib import Path
import tkinter as tk
from tkinter import colorchooser

CONFIG_PATH = Path(__file__).resolve().parent / "config" / "color.json"


def save_color(hex_color: str) -> None:
    """Save selected color to config/color.json."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({"color": hex_color}, f)


def choose_color() -> None:
    """Open color picker and persist chosen color."""
    result = colorchooser.askcolor(color=current_color.get())
    if result[1]:
        current_color.set(result[1])
        color_display.config(bg=result[1])
        save_color(result[1])


root = tk.Tk()
root.title("Color Controller")

current_color = tk.StringVar()

# Load color from config or use default
try:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        current_color.set(json.load(f).get("color", "#ff0000"))
except FileNotFoundError:
    current_color.set("#ff0000")

# Persist initial color
save_color(current_color.get())

# Color preview area
color_display = tk.Label(root, width=20, height=5, bg=current_color.get())
color_display.pack(padx=10, pady=10)

# Button to open color chooser
choose_btn = tk.Button(root, text="Choose Color", command=choose_color)
choose_btn.pack(padx=10, pady=10)

root.mainloop()
