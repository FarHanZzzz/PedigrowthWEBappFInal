// PEDI-GROWTH — PDF Export (Browser Print-Based)
// Generates a printable clinical report view and triggers browser print dialog.
// No external dependency required — uses the print stylesheet in globals.css.

import { CONCERN_HEX_COLORS, CONCERN_LABELS, isConcernLevel } from "@/lib/presentation/severity";

export interface PDFExportData {
  childNickname: string;
  ageMonths: number;
  assessmentDate: string;
  assessmentId: string;
  concerns: Record<string, string>;
  metrics: Record<string, number | string>;
  suppressedMetrics?: string[];
  qualityTier: string;
  assessmentMode: string;
  confidenceNotes?: string[];
}

/**
 * Generate a printable HTML document and trigger the print dialog.
 * This produces a clean clinical-style report suitable for PDF export
 * via the browser's "Save as PDF" print option.
 */
export function exportReportAsPDF(data: PDFExportData): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // Popup blocked — fallback to window.print()
    window.print();
    return;
  }

  const concernRows = Object.entries(data.concerns)
    .filter(([, level]) => typeof level === "string" && isConcernLevel(level))
    .map(([domain, level]) => {
      const concernLevel = isConcernLevel(level) ? level : "none";
      const color = CONCERN_HEX_COLORS[concernLevel];
      const label = CONCERN_LABELS[concernLevel];

      return `<tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-transform: capitalize;">${domain.replace(/([A-Z])/g, ' $1').trim()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">
          <span style="display:inline-block; padding: 2px 10px; border-radius: 12px; background: ${color}22; color: ${color}; font-weight: 600; font-size: 12px;">${label}</span>
        </td>
      </tr>`;
    })
    .join("") || `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;" colspan="2">No concern-level domains were available for this export.</td></tr>`;

  const metricRows = Object.entries(data.metrics)
    .filter(([key]) => !data.suppressedMetrics?.includes(key))
    .map(([key, value]) => `<tr>
      <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0; font-size: 13px;">${key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0; font-size: 13px; font-family: monospace;">${typeof value === 'number' ? value.toFixed(3) : value}</td>
    </tr>`)
    .join("");

  const suppressedNote = data.suppressedMetrics && data.suppressedMetrics.length > 0
    ? `<p style="margin-top: 12px; padding: 8px 12px; background: #FFF3E0; border-radius: 6px; font-size: 12px; color: #E65100;">
        <strong>Note:</strong> ${data.suppressedMetrics.length} metric(s) were suppressed due to insufficient confidence.
        These metrics were excluded from the concern assessment.
      </p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pedi-Growth — Screening Report</title>
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 700px;
      margin: 0 auto;
      padding: 40px 24px;
      color: #1a1a2e;
      line-height: 1.5;
    }
    h1 { font-size: 20px; margin-bottom: 4px; }
    h2 { font-size: 15px; color: #555; margin-top: 28px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e0e0e0; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    .header { text-align: center; border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; background: #E3F2FD; color: #1565C0; margin-top: 8px; }
    .disclaimer { margin-top: 32px; padding: 16px; background: #FFF8E1; border: 1px solid #FFE082; border-radius: 8px; font-size: 11px; color: #5D4037; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Pedi-Growth</h1>
    <p style="font-size: 13px; color: #666;">Pediatric Gait Concern Screening Report</p>
    <span class="badge">Screening Support Tool — Not a Diagnostic Device</span>
  </div>

  <h2>Child Profile</h2>
  <table>
    <tr><td style="padding: 6px 8px; color: #888; width: 40%;">Nickname</td><td style="padding: 6px 8px; font-weight: 500;">${data.childNickname}</td></tr>
    <tr><td style="padding: 6px 8px; color: #888;">Age</td><td style="padding: 6px 8px; font-weight: 500;">${data.ageMonths} months (${(data.ageMonths / 12).toFixed(1)} years)</td></tr>
    <tr><td style="padding: 6px 8px; color: #888;">Assessment Date</td><td style="padding: 6px 8px; font-weight: 500;">${data.assessmentDate}</td></tr>
    <tr><td style="padding: 6px 8px; color: #888;">Assessment ID</td><td style="padding: 6px 8px; font-family: monospace; font-size: 12px;">${data.assessmentId}</td></tr>
    <tr><td style="padding: 6px 8px; color: #888;">Quality Tier</td><td style="padding: 6px 8px; font-weight: 500; text-transform: capitalize;">${data.qualityTier}</td></tr>
    <tr><td style="padding: 6px 8px; color: #888;">Assessment Mode</td><td style="padding: 6px 8px; font-weight: 500;">${data.assessmentMode.replace(/_/g, ' ')}</td></tr>
  </table>

  <h2>Concern Levels</h2>
  <table>${concernRows}</table>

  <h2>Measured Metrics</h2>
  <table>${metricRows}</table>
  ${suppressedNote}

  ${data.confidenceNotes && data.confidenceNotes.length > 0
    ? `<h2>Confidence Notes</h2><ul style="font-size: 13px; color: #555;">${data.confidenceNotes.map(n => `<li style="margin-bottom: 4px;">${n}</li>`).join('')}</ul>`
    : ''}

  <div class="disclaimer">
    <strong>Important Disclaimer</strong><br>
    This report was generated by Pedi-Growth, a screening support tool. It does NOT diagnose medical conditions.
    The concern levels shown are based on automated analysis of visible movement patterns and should be discussed
    with qualified healthcare professionals. Always consult your child's healthcare team for clinical decisions.
    <br><br>
    <em>Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</em>
  </div>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to render, then trigger print
  printWindow.onload = () => {
    printWindow.print();
  };
}
