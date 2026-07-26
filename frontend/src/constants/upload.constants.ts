// Must match MAX_IMAGE_BYTES in backend/app/utils/file_handler.py — client-side
// caps stricter than the backend's real limit reject uploads the server would
// have accepted, wasting any cropping/annotation work already done.
export const MAX_IMAGE_UPLOAD_BYTES = 30 * 1024 * 1024;
