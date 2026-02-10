module.exports = {
  stylesheet: [],
  css: `
    @page {
      size: A4;
      margin: 2.2cm 2cm 2.5cm 2cm;
    }

    body {
      font-family: 'Helvetica Neue', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.65;
      color: #1a1a2e;
    }

    h1 {
      font-size: 22pt;
      color: #0f3460;
      border-bottom: 3px solid #e94560;
      padding-bottom: 12px;
      margin-top: 0;
      margin-bottom: 10px;
      line-height: 1.3;
    }

    h2 {
      font-size: 16pt;
      color: #16213e;
      border-bottom: 1.5px solid #0f3460;
      padding-bottom: 6px;
      margin-top: 32px;
      margin-bottom: 14px;
    }

    h3 {
      font-size: 13pt;
      color: #1a1a2e;
      margin-top: 22px;
      margin-bottom: 8px;
    }

    h4 {
      font-size: 11.5pt;
      color: #333;
      margin-top: 16px;
      margin-bottom: 6px;
    }

    p {
      margin-bottom: 10px;
      text-align: justify;
    }

    strong {
      color: #0f3460;
    }

    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 24px 0;
    }

    pre {
      background: #f8f9fc;
      border: 1px solid #e0e4ed;
      border-left: 4px solid #0f3460;
      border-radius: 4px;
      padding: 14px 16px;
      font-size: 8.5pt;
      line-height: 1.45;
      overflow-x: auto;
      page-break-inside: avoid;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    }

    code {
      background: #f0f2f8;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 9pt;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      color: #c7254e;
    }

    pre code {
      background: none;
      padding: 0;
      color: #1a1a2e;
      font-size: 8.5pt;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
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

    blockquote {
      border-left: 4px solid #e94560;
      background: #fef5f7;
      margin: 16px 0;
      padding: 12px 16px;
      font-style: italic;
      color: #444;
      page-break-inside: avoid;
    }

    blockquote p {
      margin: 0;
    }

    ul, ol {
      margin-bottom: 10px;
      padding-left: 24px;
    }

    li {
      margin-bottom: 4px;
    }

    a {
      color: #0f3460;
      text-decoration: none;
      border-bottom: 1px dotted #0f3460;
    }

    h1, h2, h3, h4 {
      page-break-after: avoid;
    }
  `,
  body_class: [],
  marked_options: {},
  pdf_options: {
    format: 'A4',
    margin: {
      top: '2.2cm',
      bottom: '2.5cm',
      left: '2cm',
      right: '2cm'
    },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div style="width:100%;font-size:8pt;color:#999;font-family:Helvetica Neue,Arial,sans-serif;padding:0 2cm;"><span style="float:right;">NexusBrain Intelligence Engine</span></div>',
    footerTemplate: '<div style="width:100%;font-size:9pt;color:#666;font-family:Helvetica Neue,Arial,sans-serif;text-align:center;padding:0 2cm;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
  },
  launch_options: {},
  md_file_encoding: 'utf-8',
  stylesheet_encoding: 'utf-8',
};
