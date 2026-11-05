import api from "./httpClient";
import type { UpdateStatus, VersionInfo } from "../types/version";

const VersionService = {
  getVersion: async (): Promise<VersionInfo> => {
    const res = await api.get<VersionInfo>("/version");
    return res.data;
  },

  // Cached for hours on the backend, so calling it on every app load is fine.
  getUpdateStatus: async (): Promise<UpdateStatus> => {
    const res = await api.get<UpdateStatus>("/version/update-status");
    return res.data;
  },
};

export default VersionService;
