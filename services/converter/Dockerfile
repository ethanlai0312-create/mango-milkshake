FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress poppler-utils fonts-noto-cjk fonts-liberation ca-certificates && rm -rf /var/lib/apt/lists/*
COPY install_pandoc.py /tmp/install_pandoc.py
RUN python /tmp/install_pandoc.py
RUN pip install --no-cache-dir pypdfium2==5.14.0 pdfplumber==0.11.10 pypdf==6.21.4 python-docx==1.2.0 reportlab==4.4.7 markdown==3.10 openpyxl==3.1.5
RUN useradd -u 10001 -m converter
COPY convert.py pdf_tools.py /app/
USER 10001
ENTRYPOINT ["python","/app/convert.py"]
