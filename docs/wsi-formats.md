# WSI Viewer — Libraries & Supported Formats

Quick reference for what the WSI (Whole Slide Image) viewer currently supports. For the full setup/usage workflow, see [wsi-setup.md](./wsi-setup.md).

---

## 1. Libraries in use

### Backend (`backend/requirements.txt`)

| Library | Version | Role |
|---|---|---|
| `openslide-python` | 1.4.6 | Reads slide metadata (format, dimensions, MPP) and generates DeepZoom tiles |
| `openslide-bin` | 4.0.0.6 | Native OpenSlide shared libraries (no system install needed) |
| `pillow` | 12.2.0 | Encodes tiles/thumbnails to JPEG |

No DICOM library (`pydicom`, `wsidicom`, `python-gdcm`, etc.) is installed.

### Frontend (`frontend/package.json`)

| Library | Version | Role |
|---|---|---|
| `openseadragon` | ^6.0.2 | Deep-zoom pan/zoom viewer (renders the DZI tile pyramid) |
| `@types/openseadragon` | ^5.0.2 | TypeScript types |

No DICOM viewer library (`dwv`, `cornerstone`, `dicom-microscopy-viewer`) is installed.

---

## 2. File discovery, not upload

There is no upload endpoint. The backend scans a configured filesystem directory (`wsi_settings.wsi_root_path`) and indexes files whose extension matches `WSI_EXTENSIONS`, or a scanner profile's custom `file_extensions` list.

Source: `backend/app/crud/wsi_file.py:23`

```python
WSI_EXTENSIONS = {"svs", "ndpi", "tiff", "tif", "scn", "mrxs", "vms", "vmu", "btf"}
```

## 3. Supported extensions

| Extension | Vendor / format | Notes |
|---|---|---|
| `.svs` | Aperio (Leica) | Most common, best tested |
| `.ndpi` | Hamamatsu NanoZoomer | |
| `.tiff`, `.tif` | Generic pyramidal / BigTIFF | Must be pyramidal for OpenSlide to read levels correctly |
| `.scn` | Leica SCN | |
| `.mrxs` | 3DHISTECH MIRAX | Requires the companion `Data` folder + `.ini`/index files alongside the `.mrxs` |
| `.vms`, `.vmu` | Ventana (Roche) | |
| `.btf` | Brightfield TIFF | Generic pyramidal TIFF variant |

A file is only viewable (tiles/thumbnail render) if OpenSlide can actually open it — matching the extension is not sufficient. If OpenSlide fails to open a matched file, it's still indexed (so it can be manually linked to a case) but `format`, `width_px`, `height_px`, `mpp_x/y`, and `level_count` stay `NULL`, and the viewer/thumbnail endpoints will error for that file.

## 4. Not supported

| Format | Status | Evidence |
|---|---|---|
| **DICOM (`.dcm`, DICOMDIR, DICOMweb)** | ❌ Not supported | No `.dcm` in `WSI_EXTENSIONS`; no `pydicom`/`wsidicom` in `requirements.txt`; no DICOM viewer lib in `package.json` |
| Plain image uploads (`.jpg`, `.png`) | ❌ Not applicable | No upload endpoint exists — files must land on disk in the configured root path |
| PDF slide exports | ❌ Not supported | OpenSlide has no PDF driver |
| Compressed archives (`.zip`, `.rar`) | ❌ Not supported | Not in extension list; scanner never unpacks archives |
| Remote/HTTP slide sources (e.g. DICOMweb, S3 URL) | ❌ Not supported | `wsi_root_path` is a local filesystem path only |

**DICOM check result: not implemented.** Adding it would require: a DICOM parsing library (`pydicom` or `wsidicom`), a tile-generation path separate from OpenSlide (OpenSlide does not read DICOM), extending `WSI_EXTENSIONS`/scanner profile extension handling to accept `.dcm`, and likely a different frontend renderer or an OpenSeadragon DICOM tile source — none of this exists today.

---

## 5. Where to change this

- Add/remove accepted extensions → `WSI_EXTENSIONS` in `backend/app/crud/wsi_file.py:23`, or per-scanner via the **Scanner Profile → File Extensions** field (`wsi_scanner_profiles.file_extensions`).
- Tile/thumbnail generation → `backend/app/routers/wsi_viewer.py`.
- Viewer rendering → `frontend/src/pages/WSIViewer/WSIViewerPage.tsx`.
