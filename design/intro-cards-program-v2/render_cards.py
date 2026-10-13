from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "intro-cards-current"
SIZE = (1080, 1350)

BLUE = (66, 96, 184)
GREEN = (186, 202, 122)
CREAM = (240, 235, 226)
BLACK = (22, 23, 25)


def font(size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    result = ImageFont.truetype(str(ROOT / "Onest.ttf"), size)
    result.set_variation_by_name(weight)
    return result


def draw_spaced(draw: ImageDraw.ImageDraw, xy, text: str, text_font, fill, spacing: int = 3):
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=text_font, fill=fill)
        x += draw.textlength(char, font=text_font) + spacing


def fit_font(text: str, max_width: int, preferred: int, weight: str = "ExtraBold"):
    size = preferred
    while size > 36:
        candidate = font(size, weight)
        if ImageDraw.Draw(Image.new("RGB", (1, 1))).textlength(text, font=candidate) <= max_width:
            return candidate
        size -= 2
    return font(size, weight)


def wrap(draw: ImageDraw.ImageDraw, text: str, text_font, max_width: int):
    lines = []
    current = ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if current and draw.textlength(trial, font=text_font) > max_width:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


def paste_illustration(card: Image.Image, source_name: str, crop_box, target_y=None):
    source = Image.open(SOURCE / source_name).convert("RGB")
    crop = source.crop(crop_box)
    y = crop_box[1] if target_y is None else target_y
    card.paste(crop, (crop_box[0], y))


def header(draw: ImageDraw.ImageDraw, number: str, light: bool = False):
    ink = CREAM if light else BLACK
    draw_spaced(draw, (56, 62), "ИСКУССТВО ЗАДАВАТЬ ВОПРОСЫ", font(26, "Bold"), ink, 3)
    number_font = font(36, "ExtraBold")
    draw.text((1025, 63), number, font=number_font, fill=BLUE if not light else GREEN, anchor="ra")


def title_lines(draw, lines, y, colors, preferred=82, gap=0):
    for line, color in zip(lines, colors):
        title_font = fit_font(line, 970, preferred, "ExtraBold")
        draw.text((56, y), line, font=title_font, fill=color)
        y += title_font.size + gap
    return y


def description(draw, text: str, fill, y=1120, preferred=43):
    body = font(preferred, "SemiBold")
    lines = wrap(draw, text, body, 970)
    while len(lines) > 3 and body.size > 34:
        body = font(body.size - 2, "SemiBold")
        lines = wrap(draw, text, body, 970)
    line_height = body.size + 12
    for index, line in enumerate(lines[:3]):
        draw.text((56, y + index * line_height), line, font=body, fill=fill)


def cover():
    card = Image.new("RGB", SIZE, BLUE)
    draw = ImageDraw.Draw(card)
    draw_spaced(draw, (56, 64), "ИСКУССТВО ЗАДАВАТЬ ВОПРОСЫ", font(25, "Bold"), CREAM, 3)
    draw.text((1025, 66), "6 ДИАЛОГОВ", font=font(34, "ExtraBold"), fill=GREEN, anchor="ra")
    draw.text((56, 320), "6", font=font(142, "ExtraBold"), fill=CREAM)
    draw.text((56, 470), "ПРАКТИЧЕСКИХ", font=fit_font("ПРАКТИЧЕСКИХ", 970, 104), fill=CREAM)
    draw.text((56, 575), "ЗАНЯТИЙ", font=font(116, "ExtraBold"), fill=GREEN)
    body = font(55, "SemiBold")
    for i, line in enumerate(wrap(draw, "О том, как задавать точные вопросы и вести глубокие диалоги.", body, 930)):
        draw.text((56, 820 + i * 68), line, font=body, fill=CREAM)
    card.save(ROOT / "cover.png")


def existing_card(number, background, source_name, crop_box, lines, colors, body, light=False, title_y=155, preferred=82, body_y=1120):
    card = Image.new("RGB", SIZE, background)
    paste_illustration(card, source_name, crop_box)
    draw = ImageDraw.Draw(card)
    header(draw, number, light=light)
    title_lines(draw, lines, title_y, colors, preferred=preferred)
    description(draw, body, CREAM if light else BLACK, y=body_y)
    card.save(ROOT / f"{number}.png")


def interview_card():
    card = Image.new("RGB", SIZE, CREAM)
    illustration = Image.open(ROOT / "interview-illustration.png").convert("RGBA")
    alpha = illustration.getchannel("A")
    illustration = illustration.crop(alpha.getbbox())
    illustration.thumbnail((900, 700), Image.Resampling.LANCZOS)
    card.paste(illustration, ((1080 - illustration.width) // 2, 425), illustration)
    draw = ImageDraw.Draw(card)
    header(draw, "06")
    title_lines(draw, ["Интервью:", "все методы", "в одной беседе"], 150, [BLUE, BLACK, BLACK], preferred=80)
    description(draw, "Показываем все техники сократического диалога в живой беседе и разбираем ее.", BLACK, y=1120, preferred=41)
    card.save(ROOT / "06.png")


cover()
existing_card("01", CREAM, "01.png", (0, 500, 1080, 1080), ["Как задавать", "вопросы", "правильно?"], [BLACK, BLACK, BLUE], "Базовая модель вопроса: цель, недостающие знания, корректность, проблемность и существенность.", preferred=80, body_y=1095)
existing_card("02", BLUE, "02.png", (0, 410, 1080, 1080), ["Как глубоко", "понять другого?", "(И себя)"], [CREAM, GREEN, CREAM], "Как выявлять скрытые убеждения и задавать точные проясняющие вопросы — без советов.", light=True, preferred=80, body_y=1100)
existing_card("03", GREEN, "03.png", (0, 440, 1080, 1070), ["Как дойти до", "сути проблемы?"], [BLACK, BLUE], "Как искать пробелы в логике и мягко подсвечивать внутренние конфликты.", preferred=84, body_y=1120)
existing_card("04", BLACK, "04.png", (0, 410, 1080, 1070), ["Как привести", "собеседника", "к инсайту?"], [CREAM, GREEN, GREEN], "Как создавать условия для инсайта, менять угол обзора и помогать увидеть ситуацию по-новому.", light=True, preferred=76, body_y=1100)
existing_card("05", CREAM, "05.png", (0, 440, 1080, 1080), ["Реконнектинг", "и стратегия", "вопрошания"], [BLUE, BLACK, BLACK], "Как строить цепочку вопросов, удерживать фокус и возвращаться к исходной цели разговора.", preferred=74, body_y=1110)
interview_card()
