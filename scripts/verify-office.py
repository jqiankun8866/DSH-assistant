"""Exercise the installed Office dependencies without network access or messaging."""
import json
import sys
from pathlib import Path
from docx import Document
from pptx import Presentation
from openpyxl import Workbook, load_workbook

root = Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=True)
doc = Document()
doc.add_heading('DSH 办公验收', 0)
doc.add_paragraph('这是一份虚构测试文档，不包含用户资料。')
doc.save(root / 'check.docx')
assert Document(root / 'check.docx').paragraphs[0].text == 'DSH 办公验收'
deck = Presentation()
slide = deck.slides.add_slide(deck.slide_layouts[1])
slide.shapes.title.text = 'DSH 办公验收'
slide.placeholders[1].text = '验证可编辑幻灯片生成与重新读取。'
deck.save(root / 'check.pptx')
assert len(Presentation(root / 'check.pptx').slides) == 1
book = Workbook()
sheet = book.active
sheet.title = '验收'
sheet.append(['项目', '金额'])
sheet.append(['测试A', 10])
sheet.append(['测试B', 20])
sheet.append(['合计', '=SUM(B2:B3)'])
book.save(root / 'check.xlsx')
assert load_workbook(root / 'check.xlsx').active['B4'].value == '=SUM(B2:B3)'
result = {'docx': 'created-and-reopened', 'pptx': 'created-and-reopened',
          'xlsx': 'created-and-reopened', 'formulaCachedResult': 'not-yet-checked',
          'visualInspection': 'not-performed'}
(root / 'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result))
