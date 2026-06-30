# Report Templates

This directory contains the default HTML report templates used to generate PDFs.

| File | Used for |
|------|----------|
| `surgical_report_template.html` | Surgical pathology reports |
| `gyne_cyto_report_template.html` | Gynecological cytology reports |
| `nongyne_cyto_report_template.html` | Non-gynecological cytology reports |
| `barcode_label_template.html` | Specimen barcode labels |
| `hospital_billing_summary.html` | Billing summary |
| `slide_block_release_form.html` | Slide/block release forms |

Templates use [Jinja2](https://jinja.palletsprojects.com/) syntax and are rendered via WeasyPrint to PDF.

---

## Customizing templates for your hospital

Place your customized file in the `local/` subdirectory with the **same filename**:

```
backend/app/templates/reports/
├── gyne_cyto_report_template.html        ← default (tracked by git)
└── local/
    └── gyne_cyto_report_template.html    ← your override (NOT tracked by git)
```

The system automatically uses the `local/` version when it exists — no configuration needed.

### Steps

1. Copy the template you want to customize into `local/`:
   ```bash
   cp backend/app/templates/reports/gyne_cyto_report_template.html \
      backend/app/templates/reports/local/gyne_cyto_report_template.html
   ```
2. Edit the file in `local/` to suit your hospital's branding or layout.
3. Restart the backend — the override is picked up automatically.

Files in `local/` are gitignored, so `git pull` will never overwrite your customizations.
