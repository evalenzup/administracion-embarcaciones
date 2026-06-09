import os
from pypdf import PdfReader

def extract_text():
    pdf_path = os.path.join(os.path.dirname(__file__), "temp_plan.pdf")
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        return

    reader = PdfReader(pdf_path)
    print(f"Total pages: {len(reader.pages)}")
    for i, page in enumerate(reader.pages):
        print(f"\n--- PAGE {i + 1} ---")
        print(page.extract_text())

if __name__ == "__main__":
    extract_text()
