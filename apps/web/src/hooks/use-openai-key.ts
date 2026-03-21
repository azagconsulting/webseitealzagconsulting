"use client";

import { useAuth } from "@/components/auth-provider";
import { useCallback, useEffect, useState } from "react";

type OpenAiSettingsResponse = {
  hasApiKey: boolean;
  apiKey?: string | null;
  updatedAt?: string;
};

export function useOpenAiKey() {
  const { authorizedRequest } = useAuth();
  const [openAiKey, setOpenAiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKey = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authorizedRequest<OpenAiSettingsResponse | null>("/settings/openai");
      const nextKey = response?.apiKey?.trim() || null;
      setOpenAiKey(nextKey);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OpenAI-Key konnte nicht geladen werden.");
      setOpenAiKey(null);
    } finally {
      setLoading(false);
    }
  }, [authorizedRequest]);

  useEffect(() => {
    void fetchKey();
  }, [fetchKey]);

  const saveKey = useCallback(
    async (nextKey: string | null) => {
      setSaving(true);
      try {
        await authorizedRequest<OpenAiSettingsResponse>("/settings/openai", {
          method: "PUT",
          body: JSON.stringify({ apiKey: nextKey?.trim() || null }),
        });
        setOpenAiKey(nextKey?.trim() || null);
        setError(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "OpenAI-Key konnte nicht gespeichert werden.";
        setError(message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [authorizedRequest],
  );

  return {
    openAiKey,
    loadingOpenAiKey: loading,
    savingOpenAiKey: saving,
    openAiKeyError: error,
    refreshOpenAiKey: fetchKey,
    saveOpenAiKey: saveKey,
    setOpenAiKeyError: setError,
  };
}
