from PIL import Image, ImageDraw, ImageFont


def make_brick_tape(
    width=800,
    height=200,
    brick_color=(187, 68, 68),
    bg_color=(255, 204, 0),
    text="STOP",
    font_path="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
):
    """Create a construction-style tape image with brick blocks and STOP labels.

    Args:
        width: Total width of the generated image.
        height: Total height of the generated image.
        brick_color: RGB color tuple for the bricks.
        bg_color: RGB color tuple for the background tape.
        text: Text to display on alternating bricks.
        font_path: Path to a TrueType font used for the text.
    Returns:
        A Pillow Image object with the generated tape.
    """
    img = Image.new("RGB", (width, height), color=bg_color)
    draw = ImageDraw.Draw(img)

    brick_w = width // 10
    brick_h = height // 2

    for row in range(2):
        for col in range(10):
            x0 = col * brick_w + (row % 2) * (brick_w // 2)
            y0 = row * brick_h
            draw.rectangle([x0, y0, x0 + brick_w, y0 + brick_h], fill=brick_color)
            if col % 2 == 0:
                try:
                    font = ImageFont.truetype(font_path, size=40)
                except IOError:
                    font = ImageFont.load_default()
                text_w, text_h = draw.textsize(text, font=font)
                text_x = x0 + (brick_w - text_w) // 2
                text_y = y0 + (brick_h - text_h) // 2
                draw.text((text_x, text_y), text, fill="white", font=font)
    return img


if __name__ == "__main__":
    tape = make_brick_tape()
    tape.save("brick_tape.png")
    print("brick_tape.png generated")
