"""PDF conversion using permissively licensed PDFium/pdfplumber/pypdf/docx."""
import io,pathlib,statistics,zipfile

def pdf_to_docx(source,destination):
    import pdfplumber
    from pypdf import PdfReader
    from docx import Document
    from docx.shared import Pt,Inches
    from docx.enum.section import WD_SECTION_START
    document=Document();reader=PdfReader(source)
    with pdfplumber.open(source) as pdf:
        if len(pdf.pages)>100: raise ValueError('PDF over 100 pages')
        if not any(page.extract_text() for page in pdf.pages):
            raise ValueError('Scanned PDF requires OCR, which is not currently supported')
        for number,page in enumerate(pdf.pages):
            section=document.sections[0] if number==0 else document.add_section(WD_SECTION_START.NEW_PAGE)
            section.page_width=Pt(page.width);section.page_height=Pt(page.height)
            section.top_margin=section.bottom_margin=section.left_margin=section.right_margin=Pt(36)
            tables=page.find_tables();events=[(table.bbox[1],'table',table.extract()) for table in tables]
            words=page.extract_words(extra_attrs=['fontname','size']);lines=[]
            for word in sorted(words,key=lambda w:(round(w['top']/3),w['x0'])):
                if any(t.bbox[0]<=word['x0']<=t.bbox[2] and t.bbox[1]<=word['top']<=t.bbox[3] for t in tables):continue
                if lines and abs(lines[-1][0]-word['top'])<3:lines[-1][1].append(word)
                else:lines.append((word['top'],[word]))
            events.extend((top,'text',items) for top,items in lines)
            for _,kind,items in sorted(events,key=lambda e:e[0]):
                if kind=='table':
                    if not items:continue
                    table=document.add_table(rows=len(items),cols=max(map(len,items)));table.style='Table Grid'
                    for row,values in zip(table.rows,items):
                        for cell,value in zip(row.cells,values):cell.text=value or ''
                else:
                    paragraph=document.add_paragraph()
                    for index,word in enumerate(items):
                        run=paragraph.add_run((' ' if index else '')+word['text']);run.font.size=Pt(max(6,min(72,word['size'])))
                        run.bold='bold' in word['fontname'].lower();run.italic=any(s in word['fontname'].lower() for s in ['italic','oblique'])
            # Embedded raster images remain editable images. Exact anchors/multicolumn
            # layout cannot be reconstructed reliably and are disclosed in the UI.
            try:
                for image in reader.pages[number].images:
                    picture=io.BytesIO(image.data)
                    from PIL import Image
                    with Image.open(picture) as decoded:
                        if decoded.width*decoded.height>40_000_000:continue
                        width=min((page.width-72)/72,decoded.width/96)
                    picture.seek(0);document.add_picture(picture,width=Inches(max(.1,width)))
            except (ValueError,NotImplementedError,OSError):pass
    document.save(destination)

def pdf_to_png(source,destination):
    import pypdfium2 as pdfium
    document=pdfium.PdfDocument(source)
    try:
        if len(document)>100:raise ValueError('PDF over 100 pages')
        with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_DEFLATED) as archive:
            for index in range(len(document)):
                page=document[index]
                try:
                    width,height=page.get_size()
                    if width*height*2.25>40_000_000:raise ValueError('PDF page exceeds pixel budget')
                    bitmap=page.render(scale=1.5)
                    try:
                        image=bitmap.to_pil();buffer=io.BytesIO();image.save(buffer,format='PNG')
                        archive.writestr(f'page-{index+1:03}.png',buffer.getvalue())
                    finally:bitmap.close()
                finally:page.close()
    finally:document.close()

def image_to_pdf(source,destination):
    from PIL import Image,ImageSequence
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    with Image.open(source) as image:
        result=canvas.Canvas(str(destination))
        for index,frame in enumerate(ImageSequence.Iterator(image)):
            if index>=100:raise ValueError('PDF over 100 pages')
            if frame.width*frame.height>40_000_000:raise ValueError('Image exceeds pixel budget')
            converted=frame.convert('RGB');width,height=frame.size
            result.setPageSize((width,height))
            result.drawImage(ImageReader(converted),0,0,width=width,height=height);result.showPage()
            converted.close()
        result.save()


def pdf_to_text(source,destination):
    from pypdf import PdfReader
    reader=PdfReader(source)
    if len(reader.pages)>100: raise ValueError('PDF over 100 pages')
    with pathlib.Path(destination).open('w',encoding='utf-8') as output:
        extracted=False
        for page in reader.pages:
            text=page.extract_text() or ''
            extracted=extracted or bool(text.strip())
            output.write(text+'\n\f\n')
        if not extracted: raise ValueError('Scanned PDF requires OCR')
