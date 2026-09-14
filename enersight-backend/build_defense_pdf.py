# -*- coding: utf-8 -*-
"""Generates EnerSight_Defense_Notes.pdf — a defense reviewer for the
cost (PHP) and appliance features, written in modern Bisaya + English."""

from datetime import date

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.fonts import FontFace

# ── Brand colors ──────────────────────────────────────────────
EMERALD = (4, 120, 87)
DARK = (15, 23, 42)
LIME = (163, 230, 53)
MUTED = (100, 116, 139)
LIGHT = (241, 245, 249)
EMERALD_BG = (236, 253, 245)
WHITE = (255, 255, 255)

ARIAL = r"C:\Windows\Fonts\arial.ttf"
ARIAL_B = r"C:\Windows\Fonts\arialbd.ttf"
ARIAL_I = r"C:\Windows\Fonts\ariali.ttf"

pdf = FPDF(format="A4")
pdf.set_margins(18, 16, 18)
pdf.set_auto_page_break(auto=True, margin=16)
pdf.add_font("Arial", "", ARIAL)
pdf.add_font("Arial", "B", ARIAL_B)
pdf.add_font("Arial", "I", ARIAL_I)

EPW = pdf.epw  # effective page width


def ensure_space(mm):
    if pdf.get_y() + mm > pdf.h - pdf.b_margin:
        pdf.add_page()


def section(number, title):
    ensure_space(18)
    pdf.ln(3)
    pdf.set_fill_color(*EMERALD)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Arial", "B", 12.5)
    pdf.cell(9, 9, str(number), new_x=XPos.RIGHT, new_y=YPos.TOP,
             align="C", fill=True)
    pdf.set_fill_color(*DARK)
    pdf.cell(EPW - 9, 9, "  " + title, new_x=XPos.LMARGIN, new_y=YPos.NEXT,
             align="L", fill=True)
    pdf.set_text_color(*DARK)
    pdf.ln(2.5)


def para(text, size=10.5, color=DARK):
    pdf.set_font("Arial", "", size)
    pdf.set_text_color(*color)
    pdf.multi_cell(EPW, 5.6, text=text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)


def bullet(text, size=10.5):
    pdf.set_font("Arial", "", size)
    pdf.set_text_color(*DARK)
    x = pdf.get_x()
    pdf.set_text_color(*EMERALD)
    pdf.cell(5, 5.6, text="•", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(EPW - 5, 5.6, text=text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(x)


def formula_box(lines):
    ensure_space(6 + 6.5 * len(lines))
    pdf.set_fill_color(*DARK)
    pdf.set_draw_color(*DARK)
    top = pdf.get_y()
    height = 4 + 6.8 * len(lines)
    pdf.rect(pdf.l_margin, top, EPW, height, style="F")
    pdf.set_xy(pdf.l_margin, top + 2)
    for line in lines:
        pdf.set_font("Arial", "B", 11.5)
        pdf.set_text_color(*LIME)
        pdf.cell(EPW, 6.8, text="   " + line, new_x=XPos.LMARGIN,
                 new_y=YPos.NEXT, align="L")
    pdf.set_text_color(*DARK)
    pdf.ln(3)


def note_box(text, title=None):
    ensure_space(16)
    pdf.set_fill_color(*EMERALD_BG)
    pdf.set_draw_color(*EMERALD)
    top = pdf.get_y()
    pdf.set_xy(pdf.l_margin, top)
    if title:
        pdf.set_font("Arial", "B", 10)
        pdf.set_text_color(*EMERALD)
        pdf.multi_cell(EPW, 5.4, text=title, new_x=XPos.LMARGIN,
                       new_y=YPos.NEXT, fill=True)
    pdf.set_font("Arial", "", 10)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(EPW, 5.4, text=text, new_x=XPos.LMARGIN, new_y=YPos.NEXT,
                   fill=True)
    pdf.ln(2)


def qa(q, a):
    ensure_space(16)
    pdf.set_font("Arial", "B", 10.5)
    pdf.set_text_color(*EMERALD)
    pdf.multi_cell(EPW, 5.6, text="Q: " + q, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Arial", "", 10.5)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(EPW, 5.6, text="A: " + a, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)


# ══════════════════════════════════════════════════════════════
pdf.add_page()

# Top accent bar
pdf.set_fill_color(*EMERALD)
pdf.rect(0, 0, pdf.w, 6, style="F")
pdf.set_fill_color(*LIME)
pdf.rect(0, 6, pdf.w, 1.5, style="F")
pdf.ln(6)

# Title
pdf.set_font("Arial", "B", 22)
pdf.set_text_color(*DARK)
pdf.cell(EPW, 11, text="EnerSight — Defense Notes", new_x=XPos.LMARGIN,
         new_y=YPos.NEXT)
pdf.set_font("Arial", "B", 13)
pdf.set_text_color(*EMERALD)
pdf.cell(EPW, 8, text="Cost Estimation (₱) ug Appliance Consumption",
         new_x=XPos.LMARGIN, new_y=YPos.NEXT)
pdf.set_font("Arial", "", 10)
pdf.set_text_color(*MUTED)
pdf.cell(EPW, 6,
         text="Capstone Defense Reviewer  ·  Bisaya + English  ·  "
         + date.today().strftime("%B %d, %Y"),
         new_x=XPos.LMARGIN, new_y=YPos.NEXT)
pdf.ln(2)

# ── Section 1 ──
section(1, "Unsa ang Gidugang ug Ngano")
para("Duha ka feature ang gidugang base sa gipangayo sa panelist:")
bullet("PHP Peso Cost — dili na lang kWh ang makita, kondili pila na pud ang "
       "bayronon (₱) sa kuryente.")
bullet("Appliances per Building — makaadd ka ug mga appliance sa matag "
       "building, para makita kung asa napunta ang kuryente ug kinsang "
       "building ang pinaka-kusog mo-consume.")
pdf.ln(1)
para("Justification (kung mangutana \"ngano gidugang ni?\"): Ang raw kWh, "
     "lisod sabton sa ordinaryong user o manager. Ang peso naghatag ug klaro "
     "nga business value — makita dayon nila kung pila ang gasto. Ang "
     "appliances naghatag ug breakdown — dili lang \"pila,\" kondili \"asa "
     "gikan\" ang consumption.")

# ── Section 2 ──
section(2, "Ang Core Formula (pinaka-importante)")
formula_box([
    "Energy (kWh) = Watts × Oras ÷ 1000",
    "Bayronon (₱) = kWh × Rate (₱/kWh)",
])
para("Ang metro sa kuryente nag-sukod ug kilowatt-hour (kWh), dili watt. Ang "
     "\"÷ 1000\" mao ang nag-convert sa watts ngadto sa kilowatts "
     "(1 kW = 1000 W). Ang 1 kWh = 1 \"unit\" sa electric bill.")
para("Para sa appliance, buo nga formula:")
formula_box([
    "kWh/bulan = (Watts × Qty × Oras/adlaw × Adlaw/bulan) ÷ 1000",
])
note_box(
    "Aircon 1.5 HP = 1,120 W, gamiton 8 oras/adlaw, 30 adlaw, rate "
    "₱12/kWh:\n"
    "kWh = (1,120 × 1 × 8 × 30) ÷ 1000 = 268.8 kWh/bulan\n"
    "Bayronon = 268.8 × 12 = ₱3,225.60/bulan",
    title="Worked Example (na-verify sa code):")

# ── Section 3 ──
section(3, "Duha ka Consumption Source (KEY POINT)")
para("Kini ang pinaka-lagmit nga pangutana: \"Ngano naay appliances kung naa "
     "naman meter reading?\"")

pdf.set_font("Arial", "", 9.5)
headings = FontFace(emphasis="BOLD", color=WHITE, fill_color=EMERALD)
with pdf.table(col_widths=(24, 38, 38), text_align="LEFT", line_height=5.4,
               headings_style=headings) as table:
    table.row(("Aspeto", "Meter (OCR)", "Appliances (Watts)"))
    table.row(("Klase", "Aktwal / Measured", "Estimate / Calculated"))
    table.row(("Gikan", "Litrato sa metro (current - previous)",
               "Sum sa watts × oras"))
    table.row(("Ang gisulti", "Pila JUD ang gigamit sa building",
               "Asa napunta ang kuryente"))
pdf.ln(3)

para("Managlahi silag purpose. Ang metro = ground truth (nag-rank kung asa "
     "building ang pinaka-kusog). Ang appliances = breakdown/estimate "
     "(nag-answer \"ngano taas?\" — aircon ba, server, o lights).")
note_box(
    "Kung ang metro mas taas kaysa sum sa appliances, timaan ni ug posibleng "
    "wastage o phantom load. Kini nga angle, ma-tie sa RA 11285 (Energy "
    "Efficiency and Conservation Act) nga naa na sa inyong reports.",
    title="Bonus (strong defense point):")

# ── Section 4 ──
section(4, "Technical Details")
bullet("Rate: gi-store sa global settings table (default ₱12/kWh), "
       "editable sa Settings page. Dili hard-coded — para ma-adjust sa actual "
       "rate sa distribution utility (Davao Light, etc.).")
bullet("Appliances: bag-ong appliances table nga naka-link sa building via "
       "foreign key. Fields: name, category, wattage, quantity, hours/day, "
       "days/month.")
bullet("Computation: gi-compute sa backend (single source of truth) para "
       "consistent, dili lang sa frontend.")
bullet("Validation: dili maka-save ug invalid nga data (wattage > 0, "
       "hours >= 0, ug uban pa).")

# ── Section 5 ──
section(5, "Assumptions ug Limitations")
para("Importante ni nga i-acknowledge — timaan sa maayong researcher.")
bullet("Ang appliance figure kay ESTIMATE, dili exact. Nag-assume ug constant "
       "wattage samtang naka-ON ang appliance (sa tinuod, mag-vary — mag-cycle "
       "ang aircon compressor). Standard estimation method ni sa energy audits.")
bullet("Ang oras/adlaw ug adlaw/bulan kay user input. Kung sayop ang gi-input, "
       "sayop ang estimate. Mao nga ang metro gihapon ang ground truth.")
bullet("Ang ₱ kay ENERGY CHARGE estimate, dili buong bill. Ang tinuod nga "
       "bill naay dugang: generation, transmission, system loss, VAT, ug uban "
       "pa. Ang amoa: kWh × rate.")
bullet("Single flat rate lang — wala pa nag-handle ug tiered o time-of-use "
       "rates.")

# ── Section 6 ──
section(6, "Lagmit nga Pangutana + Tubag")
qa("Asa gikuha ang wattage sa appliances?",
   "Sa nameplate/rated power sa appliance (naka-print sa label). Ang \"Quick "
   "Pick\" presets kay typical values ra para paspas mag-input, pero editable.")
qa("Ngano ₱12 ang rate?",
   "Default value ra — configurable sa Settings. I-set base sa actual rate sa "
   "distribution utility (Davao area ≈ ₱11– 13/kWh).")
qa("Unsa ang accuracy ani?",
   "Ang appliance estimate = banabana para sa breakdown. Ang decision-grade "
   "nga data gikan sa metro (measured, verified via OCR). Dual-approach ang "
   "design.")
qa("Ngano dili nalang ang metro ang gamiton?",
   "Ang metro nag-sulti sa total ra sa building — dili niya masulti asa "
   "napunta. Ang appliances mao ang naghatag ug per-appliance breakdown ug "
   "maka-estimate para sa spaces nga walay kaugalingong metro.")

# ── Footer note ──
pdf.ln(2)
pdf.set_draw_color(*LIGHT)
pdf.set_line_width(0.4)
y = pdf.get_y()
pdf.line(pdf.l_margin, y, pdf.l_margin + EPW, y)
pdf.ln(2)
pdf.set_font("Arial", "I", 9)
pdf.set_text_color(*MUTED)
pdf.multi_cell(EPW, 5,
               text="EnerSight — See energy clearly, manage buildings wisely.",
               new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")

out = r"C:\capstone\EnerSight\EnerSight_Defense_Notes.pdf"
pdf.output(out)
print("PDF created:", out)
