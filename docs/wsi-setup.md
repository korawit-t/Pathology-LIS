# WSI (Whole Slide Image) Setup Guide

This guide covers everything needed to get WSI scanning and viewing working in Pathology LIS — from installing dependencies to confirming a slide link and viewing it in the diagnosis form.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Set the WSI Root Path](#2-set-the-wsi-root-path)
3. [Configure a Scanner Profile](#3-configure-a-scanner-profile)
4. [Scan Files](#4-scan-files)
5. [Review and Confirm Slide Links](#5-review-and-confirm-slide-links)
6. [Manual Linking](#6-manual-linking)
7. [Viewing Slides in Diagnosis Form](#7-viewing-slides-in-diagnosis-form)
8. [Roles and Access](#8-roles-and-access)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

### OpenSlide

The backend uses [OpenSlide](https://openslide.org/) to read slide metadata (format, dimensions, microns-per-pixel).

**macOS**
```bash
brew install openslide
pip install openslide-python
```

**Ubuntu / Debian**
```bash
apt-get install openslide-tools libopenslide0
pip install openslide-python
```

**Supported formats:** SVS, NDPI, TIFF, SCN, MRXS, VMS, VMU

> If OpenSlide is not installed, slides are still discovered and can still be linked manually — only the Format, Dimensions, and MPP columns will be empty.

---

## 2. Set the WSI Root Path

The WSI root path is the directory on the server where the scanner saves slide files.

1. Go to **IT Administration → System Settings**
2. Open the **WSI** tab
3. Enter the absolute path to the slide folder, e.g.:
   ```
   /mnt/scanner/slides
   ```
4. Click **Save**

> The backend process must have **read access** to this path. On Railway or Docker, mount the folder as a volume.

---

## 3. Configure a Scanner Profile

A scanner profile tells the system how to parse the filename into an accession number and block code so that slides can be automatically matched to cases.

1. Go to **IT Administration → System Settings → WSI tab**
2. Under **Scanner Profiles**, click **Add Profile**
3. Fill in the fields:

| Field | Description | Example |
|---|---|---|
| **Name** | Profile display name | `Aperio GT 450` |
| **Filename Pattern** | Order of tokens in the filename | `{accession}_{block}` |
| **Separator** | Character between tokens | `_` |
| **File Extensions** | Comma-separated list | `svs, tiff` |
| **Active** | Enable this profile | ✓ |

4. Click **Set as Default** on the profile you want to use for auto-matching
5. Click **Save**

**Example:** filename `S25-001_A1.svs` with pattern `{accession}_{block}` and separator `_`
→ accession = `S25-001`, block = `A1`

> If your scanner names files differently (e.g. `A1_S25-001.svs`), set the pattern to `{block}_{accession}`.

---

## 4. Scan Files

After setting the root path and scanner profile:

1. Go to **Histology → WSI Files**
2. Click **Scan Files** in the top-right corner
3. A summary dialog will appear:

| Count | Meaning |
|---|---|
| **New Files** | Newly discovered slide files |
| **Updated** | Files seen before, metadata refreshed |
| **Auto-linked** | Files matched to a surgical block automatically |
| **Pending Review** | Auto-links waiting for staff confirmation |

Scan can be triggered as often as needed — it is safe to run multiple times.

---

## 5. Review and Confirm Slide Links

When a file is successfully auto-matched, it shows as **Pending** in the Link Status column.

1. In **Histology → WSI Files**, find a row with a yellow **Pending** badge
2. Click **Review**
3. A dialog shows the suggested link:
   - Filename
   - Matched case (accession number, patient name)
   - Matched block
4. Click **Confirm** to accept, or **Reject** to dismiss

Only **Confirmed** links are visible to pathologists in the diagnosis form.

---

## 6. Manual Linking

Files with non-standard names (e.g. `test.svs`) cannot be auto-matched and appear as **Unlinked**.

1. Click **Link** next to an Unlinked badge
2. In the **Link WSI to Case** dialog:
   - Type an accession number or patient name in the search box and press **Enter**
   - Expand the case to see specimens and blocks
   - Select the correct block using the radio button
   - Optionally change the stain type (default: H&E) and Primary flag
3. Click **Link & Confirm**

The file is immediately linked and confirmed — no separate review step is required.

**Correcting a wrong link:**  
If a confirmed link is incorrect, click **Edit** next to the Confirmed badge. The existing link is automatically rejected before the new one is created.

---

## 7. Viewing Slides in Diagnosis Form

Once a slide is confirmed, it appears automatically in the surgical diagnosis form.

### WsiSlidesSection (case level)

A collapsible card labelled **WSI Slides** appears between the Clinical Diagnosis and Diagnostic Station sections. It shows all confirmed slides for the current case with thumbnails and an **Open** button.

### WSI Tab (specimen level)

Inside each specimen's editor, a third tab **WSI** shows only slides linked to blocks within that specimen. This helps pathologists focus on the relevant slides when diagnosing a specific specimen.

### Full-screen Viewer

Clicking **Open** launches the OpenSeadragon-based viewer in a new browser tab. The viewer supports:
- Smooth pan and zoom
- Mouse wheel zoom
- Keyboard shortcuts: `+` / `-` zoom, `R` reset, `F` fit to screen
- Navigator thumbnail (bottom-right corner)
- Back button to return to the previous page

### WSI Slides page (Diagnosis menu)

Pathologists can also browse all confirmed slides from **Diagnosis → WSI Slides** without opening an individual case. Slides are searchable by filename, accession number, or block code.

---

## 8. Roles and Access

| Page | Menu location | Roles |
|---|---|---|
| WSI Files | Histology → WSI Files | `histo`, `lab_manager`, `admin` |
| WSI Slides (read-only) | Diagnosis → WSI Slides | `pathologist`, `senior_pathologist`, `lab_manager`, `admin` |
| WSI viewer | Opened from any WSI page | All roles above |
| System Settings (WSI config) | IT Administration | `admin` |

---

## 9. Troubleshooting

### Format / Dimensions are empty

OpenSlide could not open the file. Check:
```bash
python -c "import openslide; s = openslide.open_slide('/path/to/slide.svs'); print(s.properties)"
```
If this throws an error, reinstall OpenSlide or verify the file is a valid WSI format.

### Accession / Block are empty after scan

The filename does not match the scanner profile pattern. Check:
- Is a default scanner profile set?
- Does the separator match? (underscore `_` vs dash `-` vs space)
- Does the pattern order match? (`{accession}_{block}` vs `{block}_{accession}`)
- Is the block code in the expected format? (letter + digits, e.g. `A1`, `B12`)

For files that never follow a naming convention, use [Manual Linking](#6-manual-linking) instead.

### Slide does not appear in the diagnosis form

- Confirm the link status is **Confirmed** (not Pending or Rejected)
- Refresh the diagnosis form page
- If the case has multiple specimens, check the WSI tab for the correct specimen — slides are filtered by specimen label prefix (e.g. block `A1` appears under specimen `A`)

### Scan button returns an error

- Verify the WSI root path exists and is readable by the server process
- On Railway: confirm the volume is mounted at the configured path
- Check the backend logs for the specific OS error

### Thumbnail is not loading in the form

The thumbnail endpoint (`GET /wsi/thumbnail`) calls OpenSlide at request time. If the backend cannot reach the file path (e.g. volume not mounted), the thumbnail will silently fail and the image area will be hidden.
