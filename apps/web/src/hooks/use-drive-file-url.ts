"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { buildApiUrl } from "@/lib/api";

export function useDriveFileUrl(fileId?: string | null) {
  const { tokens } = useAuth();
  const accessToken = tokens?.accessToken;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    if (!fileId || !accessToken) {
      cleanup();
      setUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      return cleanup;
    }

    setUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    const controller = new AbortController();

    fetch(buildApiUrl(`/drive/files/${fileId}/download`), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Download fehlgeschlagen.");
        }
        return response.blob();
      })
      .then((blob) => {
        if (!active) {
          return;
        }
        cleanup();
        objectUrl = URL.createObjectURL(blob);
        setUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return objectUrl;
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }
        cleanup();
        setUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return null;
        });
      });

    return () => {
      active = false;
      controller.abort();
      cleanup();
    };
  }, [fileId, accessToken]);

  return { url, loading: Boolean(fileId && accessToken && !url) };
}
