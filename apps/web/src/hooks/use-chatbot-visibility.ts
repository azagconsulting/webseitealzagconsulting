"use client";

import { useAuth } from "@/components/auth-provider";
import { useCallback, useEffect, useState } from "react";

type ChatbotLauncherResponse = {
  enabled: boolean;
  updatedAt?: string;
};

export function useChatbotVisibility() {
  const { authorizedRequest } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVisibility = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authorizedRequest<ChatbotLauncherResponse | null>("/settings/chatbot/launcher");
      setEnabled(response?.enabled ?? false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sichtbarkeit konnte nicht geladen werden.");
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [authorizedRequest]);

  useEffect(() => {
    void fetchVisibility();
  }, [fetchVisibility]);

  const saveVisibility = useCallback(
    async (next: boolean) => {
      setSaving(true);
      try {
        await authorizedRequest<ChatbotLauncherResponse>("/settings/chatbot/launcher", {
          method: "PUT",
          body: JSON.stringify({ enabled: next }),
        });
        setEnabled(next);
        setError(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Sichtbarkeit konnte nicht gespeichert werden.";
        setError(message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [authorizedRequest],
  );

  return {
    enabled,
    loadingVisibility: loading,
    savingVisibility: saving,
    visibilityError: error,
    refreshVisibility: fetchVisibility,
    saveVisibility,
    setVisibilityError: setError,
  };
}
