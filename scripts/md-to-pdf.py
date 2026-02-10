#!/usr/bin/env python3
"""Convert NexusBrain whitepapers from Markdown to styled PDFs."""

import os
import sys
import markdown
from weasyprint import HTML

# Professional CSS styling for the whitepapers
CSS = """
@page {
    size: A4;
    margin: 2.5cm 2cm 2.5cm 2cm;
    @bottom-center {
        content: "Page " counter(page) " of " counter(pages);
        font-size: 9pt;
        color: #666;
        font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    @top-right {
        content: "NexusBrain Intelligence Engine";
        font-size: 8pt;
        color: #999;
        font-family: 'Helvetica Neue', Arial, sans-serif;
    }
}

@page :first {
    @top-right { content: none; }
    @bottom-center { content: none; }
}

body {
    font-family: 'Helvetica Neue', 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a2e;
    max-width: 100%;
}

h1 {
    font-size: 22pt;
    color: #0f3460;
    border-bottom: 3px solid #e94560;
    padding-bottom: 12px;
    margin-top: 0;
    margin-bottom: 8px;
    line-height: 1.3;
    page-break-after: avoid;
}

h2 {
    font-size: 16pt;
    color: #16213e;
    border-bottom: 1.5px solid #0f3460;
    padding-bottom: 6px;
    margin-top: 28px;
    margin-bottom: 12px;
    page-break-after: avoid;
}

h3 {
    font-size: 13pt;
    color: #1a1a2e;
    margin-top: 20px;
    margin-bottom: 8px;
    page-break-after: avoid;
}

h4 {
    font-size: 11.5pt;
    color: #333;
    margin-top: 16px;
    margin-bottom: 6px;
    page-break-after: avoid;
}

p {
    margin-bottom: 10px;
    text-align: justify;
}

strong {
    color: #0f3460;
}

/* Title block styling */
h1 + p strong {
    font-size: 11pt;
    color: #555;
}

hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 20px 0;
}

/* Code blocks */
pre {
    background: #f8f9fc;
    border: 1px solid #e0e4ed;
    border-left: 4px solid #0f3460;
    border-radius: 4px;
    padding: 14px 16px;
    font-size: 9pt;
    line-height: 1.5;
    overflow-x: auto;
    page-break-inside: avoid;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}

code {
    background: #f0f2f8;
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 9.5pt;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    color: #c7254e;
}

pre code {
    background: none;
    padding: 0;
    color: #1a1a2e;
}

/* Tables */
table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 10pt;
    page-break-inside: avoid;
}

th {
    background: #0f3460;
    color: white;
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    font-size: 10pt;
}

td {
    padding: 8px 12px;
    border-bottom: 1px solid #e0e4ed;
}

tr:nth-child(even) td {
    background: #f8f9fc;
}

tr:hover td {
    background: #eef1f8;
}

/* Blockquotes */
blockquote {
    border-left: 4px solid #e94560;
    background: #fef5f7;
    margin: 14px 0;
    padding: 12px 16px;
    font-style: italic;
    color: #444;
    page-break-inside: avoid;
}

blockquote p {
    margin: 0;
}

/* Lists */
ul, ol {
    margin-bottom: 10px;
    padding-left: 24px;
}

li {
    margin-bottom: 4px;
}

/* Math-like expressions (rendered as code in markdown) */
p code {
    white-space: nowrap;
}

/* Links */
a {
    color: #0f3460;
    text-decoration: none;
    border-bottom: 1px dotted #0f3460;
}

/* Abstract section highlight */
h2 + p:first-of-type {
    font-size: 11pt;
}

/* Emphasis for key terms */
em {
    color: #333;
}

/* Figure-like ASCII diagrams */
pre:has(code) {
    text-align: left;
}

/* Page breaks before major sections */
h2 {
    page-break-before: auto;
}

/* Keep headings with content */
h1, h2, h3, h4 {
    page-break-after: avoid;
    orphans: 3;
    widows: 3;
}

/* Avoid orphans in paragraphs */
p {
    orphans: 3;
    widows: 3;
}
"""


def convert_md_to_pdf(md_path: str, pdf_path: str) -> None:
    """Convert a Markdown file to a styled PDF."""
    with open(md_path, "r", encoding="utf-8") as f:
        md_content = f.read()

    # Handle LaTeX-style math: convert $...$ to code blocks for display
    # (weasyprint doesn't support MathJax, so we render as monospace)
    import re

    # Convert display math $$...$$ to styled blocks
    md_content = re.sub(
        r'\$\$(.*?)\$\$',
        lambda m: f'\n```\n{m.group(1).strip()}\n```\n',
        md_content,
        flags=re.DOTALL
    )

    # Convert inline math $...$ to code
    md_content = re.sub(
        r'(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)',
        lambda m: f'`{m.group(1)}`',
        md_content
    )

    # Convert markdown to HTML
    html_body = markdown.markdown(
        md_content,
        extensions=[
            'tables',
            'fenced_code',
            'codehilite',
            'toc',
            'attr_list',
            'md_in_html',
        ],
        extension_configs={
            'codehilite': {
                'css_class': 'highlight',
                'guess_lang': False,
            }
        }
    )

    # Wrap in full HTML document
    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>{CSS}</style>
</head>
<body>
{html_body}
</body>
</html>"""

    # Generate PDF
    HTML(string=html_doc).write_pdf(pdf_path)
    size_kb = os.path.getsize(pdf_path) / 1024
    print(f"  Created: {pdf_path} ({size_kb:.0f} KB)")


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    docs_dir = os.path.join(base_dir, "docs")

    files = [
        ("whitepaper-causeme.md", "NexusBrain-CauseME-Whitepaper.pdf"),
        ("whitepaper-causalrivers.md", "NexusBrain-CausalRivers-Whitepaper.pdf"),
    ]

    print("Converting NexusBrain whitepapers to PDF...")
    print()

    for md_name, pdf_name in files:
        md_path = os.path.join(docs_dir, md_name)
        pdf_path = os.path.join(docs_dir, pdf_name)

        if not os.path.exists(md_path):
            print(f"  SKIP: {md_path} not found")
            continue

        print(f"  Processing: {md_name}")
        convert_md_to_pdf(md_path, pdf_path)

    print()
    print("Done! PDFs are in the docs/ directory.")


if __name__ == "__main__":
    main()
